import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { createDocument, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { renderStatementOfAccountHtml } from '@/lib/docTemplates';

function ymdToday() {
  return new Date().toISOString().slice(0, 10);
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampYmd(s: string) {
  const v = String(s ?? '').trim();
  return isYmd(v) ? v : '';
}

function moneyRound2(n: number) {
  return Math.round(n * 100) / 100;
}

function daysBetween(fromYmd: string, toYmd: string) {
  if (!isYmd(fromYmd) || !isYmd(toYmd)) return 0;
  const a = new Date(`${fromYmd}T00:00:00Z`).getTime();
  const b = new Date(`${toYmd}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function overdueBucketFromInvoiceDate(invoiceDateYmd: string, statementDateYmd: string) {
  const diffDays = daysBetween(invoiceDateYmd, statementDateYmd);
  if (diffDays <= 0) return null;
  if (diffDays <= 90) return 'm1to3' as const;
  if (diffDays <= 180) return 'm3to6' as const;
  if (diffDays <= 365) return 'm6to12' as const;
  return 'over12' as const;
}

function parseSeqState(docTitle?: string) {
  const m = /SOA-(\d{6})-(\d{4})/.exec(docTitle ?? '');
  if (!m) return null;
  return { yyyymm: m[1], seq: Number(m[2]) || 0 };
}

function nextStatementNo(docs: Array<{ type: string; title: string }>) {
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  let maxSeq = 0;
  for (const d of docs) {
    if (d.type !== 'SOA') continue;
    const p = parseSeqState(d.title);
    if (!p) continue;
    if (p.yyyymm !== yyyymm) continue;
    if (p.seq > maxSeq) maxSeq = p.seq;
  }
  const next = maxSeq + 1;
  return `SOA-${yyyymm}-${String(next).padStart(4, '0')}`;
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const canViewAll = hasPermission(me, 'invoices', 'viewAll');
  if (!canViewAll) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { clientId?: unknown; periodFrom?: unknown; periodTo?: unknown; currency?: unknown }
    | null;
  const clientId = String(body?.clientId ?? '').trim();
  const periodFrom = clampYmd(String(body?.periodFrom ?? ''));
  const periodTo = clampYmd(String(body?.periodTo ?? ''));
  const currency = String(body?.currency ?? 'SGD').trim() || 'SGD';

  if (!clientId || !periodFrom || !periodTo) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }
  if (periodFrom > periodTo) {
    return NextResponse.json({ ok: false, error: 'INVALID_PERIOD' }, { status: 400 });
  }

  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId && !c.deletedAt) ?? null;
  if (!client) return NextResponse.json({ ok: false, error: 'CLIENT_NOT_FOUND' }, { status: 404 });

  const today = ymdToday();
  const events: Array<{ kind: 'INVOICE' | 'PAYMENT'; date: string; invoiceNo: string; amount: number }> = [];

  const invoices = db.invoices
    .filter((inv) => !(inv as any).deletedAt)
    .filter((inv) => inv.billTo.type === 'CLIENT' && inv.billTo.clientId === clientId);

  for (const inv of invoices) {
    const invoiceDate = String(inv.issueDate ?? '').slice(0, 10);
    const total = inv.status === 'VOID' ? 0 : Number(inv.total) || 0;
    if (isYmd(invoiceDate) && invoiceDate >= periodFrom && invoiceDate <= periodTo) {
      events.push({ kind: 'INVOICE', date: invoiceDate, invoiceNo: inv.invoiceNo, amount: moneyRound2(total) });
    }

    const paidAt = typeof inv.paidAt === 'string' ? inv.paidAt.slice(0, 10) : '';
    if (inv.status === 'PAID' && isYmd(paidAt) && paidAt >= periodFrom && paidAt <= periodTo) {
      events.push({ kind: 'PAYMENT', date: paidAt, invoiceNo: inv.invoiceNo, amount: moneyRound2(-total) });
    }
  }

  const overdueSummary = invoices.reduce(
    (acc, inv) => {
      if (inv.status !== 'UNPAID') return acc;
      const invoiceDate = String(inv.issueDate ?? '').slice(0, 10);
      if (!isYmd(invoiceDate)) return acc;
      const total = Number(inv.total) || 0;
      if (!(total > 0)) return acc;
      const bucket = overdueBucketFromInvoiceDate(invoiceDate, today);
      if (!bucket) return acc;
      acc[bucket] += total;
      return acc;
    },
    { m1to3: 0, m3to6: 0, m6to12: 0, over12: 0 },
  );
  overdueSummary.m1to3 = moneyRound2(overdueSummary.m1to3);
  overdueSummary.m3to6 = moneyRound2(overdueSummary.m3to6);
  overdueSummary.m6to12 = moneyRound2(overdueSummary.m6to12);
  overdueSummary.over12 = moneyRound2(overdueSummary.over12);

  events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.invoiceNo.localeCompare(b.invoiceNo) : a.kind === 'INVOICE' ? -1 : 1));

  const totals = events.reduce(
    (acc, e) => {
      if (e.kind === 'INVOICE') acc.invoiceAmount += e.amount;
      if (e.kind === 'PAYMENT') acc.paymentAmount += e.amount;
      acc.netAmount += e.amount;
      return acc;
    },
    { invoiceAmount: 0, paymentAmount: 0, netAmount: 0 },
  );
  totals.invoiceAmount = moneyRound2(totals.invoiceAmount);
  totals.paymentAmount = moneyRound2(totals.paymentAmount);
  totals.netAmount = moneyRound2(totals.netAmount);

  const statementNo = nextStatementNo(db.documents);
  const html = renderStatementOfAccountHtml({
    statementNo,
    issuedAt: today,
    periodFrom,
    periodTo,
    billTo: { name: `${client.code} ${client.name}`.trim(), address: client.address ?? undefined, email: client.email ?? undefined, phone: client.phone ?? undefined },
    lines: events,
    totals,
    overdueSummary,
    currency,
  });

  const doc = await createDocument({ type: 'SOA', title: statementNo, html });
  return NextResponse.json({ ok: true, documentId: doc.id, statementNo, pdfUrl: `/api/documents/${encodeURIComponent(doc.id)}/pdf` });
}
