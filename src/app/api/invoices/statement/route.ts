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

function addMonthsTag(dueYmd: string, todayYmd: string) {
  if (!isYmd(dueYmd) || !isYmd(todayYmd)) return '';
  const due = new Date(`${dueYmd}T00:00:00Z`).getTime();
  const today = new Date(`${todayYmd}T00:00:00Z`).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(today)) return '';
  const diffDays = Math.floor((today - due) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return '';
  if (diffDays <= 90) return '1-3 months';
  if (diffDays <= 180) return '3-6 months';
  if (diffDays <= 365) return '6-12 months';
  return '>12 months';
}

function moneyRound2(n: number) {
  return Math.round(n * 100) / 100;
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
  const lines = db.invoices
    .filter((inv) => !(inv as any).deletedAt)
    .filter((inv) => inv.billTo.type === 'CLIENT' && inv.billTo.clientId === clientId)
    .filter((inv) => {
      const d = String(inv.issueDate ?? '').slice(0, 10);
      if (!isYmd(d)) return false;
      return d >= periodFrom && d <= periodTo;
    })
    .sort((a, b) => String(a.issueDate).localeCompare(String(b.issueDate)) || a.createdAt.localeCompare(b.createdAt))
    .map((inv) => {
      const debit = inv.status === 'VOID' ? 0 : Number(inv.total) || 0;
      const credit = inv.status === 'PAID' ? debit : 0;
      const outstanding = moneyRound2(Math.max(0, debit - credit));
      const dueDate = typeof inv.dueDate === 'string' ? inv.dueDate.slice(0, 10) : undefined;
      const overdueBucket = inv.status === 'UNPAID' && dueDate ? addMonthsTag(dueDate, today) : '';
      return {
        invoiceNo: inv.invoiceNo,
        issueDate: String(inv.issueDate).slice(0, 10),
        dueDate,
        debit: moneyRound2(debit),
        credit: moneyRound2(credit),
        outstanding,
        overdueBucket,
      };
    });

  const totals = lines.reduce(
    (acc, l) => {
      acc.debit += l.debit;
      acc.credit += l.credit;
      acc.outstanding += l.outstanding;
      return acc;
    },
    { debit: 0, credit: 0, outstanding: 0 },
  );
  totals.debit = moneyRound2(totals.debit);
  totals.credit = moneyRound2(totals.credit);
  totals.outstanding = moneyRound2(totals.outstanding);

  const statementNo = nextStatementNo(db.documents);
  const html = renderStatementOfAccountHtml({
    statementNo,
    issuedAt: today,
    periodFrom,
    periodTo,
    billTo: { name: `${client.code} ${client.name}`.trim(), address: client.address ?? undefined, email: client.email ?? undefined, phone: client.phone ?? undefined },
    lines,
    totals,
    currency,
  });

  const doc = await createDocument({ type: 'SOA', title: statementNo, html });
  return NextResponse.json({ ok: true, documentId: doc.id, statementNo, pdfUrl: `/api/documents/${encodeURIComponent(doc.id)}/pdf` });
}
