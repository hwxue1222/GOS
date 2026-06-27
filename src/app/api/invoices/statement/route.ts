import { NextResponse } from 'next/server';
import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';

import { getCurrentUser } from '@/lib/auth';
import { createDocument, readDb } from '@/lib/db';
import { getInvoiceIssuerConfig } from '@/lib/invoice';
import { hasPermission } from '@/lib/permissions';
import { renderStatementOfAccountHtml } from '@/lib/docTemplates';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getBrowser() {
  const g = globalThis as unknown as { __gosStatementPdfBrowserPromise?: Promise<Browser> };
  if (!g.__gosStatementPdfBrowserPromise) {
    g.__gosStatementPdfBrowserPromise = (async () => {
      const chromiumMod = await import('@sparticuz/chromium');
      const puppeteerMod = await import('puppeteer-core');
      const chromium = chromiumMod.default ?? chromiumMod;
      const puppeteer = puppeteerMod.default ?? puppeteerMod;

      const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_EXECUTABLE_PATH?.trim();
      const chromiumPath = await chromium.executablePath();
      const macCandidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
      const candidate =
        (envPath && fs.existsSync(envPath) ? envPath : null) ||
        (chromiumPath && fs.existsSync(chromiumPath) ? chromiumPath : null) ||
        macCandidates.find((p) => fs.existsSync(p)) ||
        null;
      if (!candidate) throw new Error('CHROME_NOT_FOUND');
      const executablePath = candidate;
      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    })();
  }
  return g.__gosStatementPdfBrowserPromise;
}

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'statement';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

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
  if (diffDays < 30) return null;
  if (diffDays <= 90) return 'm1to3' as const;
  if (diffDays <= 180) return 'm3to6' as const;
  if (diffDays <= 365) return 'm6to12' as const;
  return 'over12' as const;
}

function sanitizeClientCode(code: string) {
  const raw = String(code ?? '').trim().toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, '');
}

function buildStatementNo(input: { issuedAtYmd: string; clientCode: string; existingTitles: string[] }) {
  const ymd = input.issuedAtYmd;
  const yyyymm = isYmd(ymd) ? `${ymd.slice(0, 4)}${ymd.slice(5, 7)}` : new Date().toISOString().slice(0, 7).replace('-', '');
  const code = sanitizeClientCode(input.clientCode) || 'CLIENT';
  const base = `SOA-${yyyymm}-${code}`;
  if (!input.existingTitles.includes(base)) return base;
  let n = 2;
  while (input.existingTitles.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const canViewAll = hasPermission(me, 'invoices', 'viewAll');
  if (!canViewAll) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { clientId?: unknown; periodFrom?: unknown; periodTo?: unknown; currency?: unknown; format?: unknown }
    | null;
  const clientId = String(body?.clientId ?? '').trim();
  const periodFrom = clampYmd(String(body?.periodFrom ?? ''));
  const periodTo = clampYmd(String(body?.periodTo ?? ''));
  const currency = String(body?.currency ?? 'SGD').trim() || 'SGD';
  const format = String(body?.format ?? '').trim().toLowerCase();

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

  const issuer = (() => {
    const inPeriod = invoices.filter((inv) => {
      const d = String(inv.issueDate ?? '').slice(0, 10);
      return isYmd(d) && d >= periodFrom && d <= periodTo;
    });
    const pool = inPeriod.length ? inPeriod : invoices;
    const counts = new Map<string, number>();
    for (const inv of pool) {
      const k = String((inv as any).issuer ?? '').trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best = 'BBY_SG';
    let bestN = -1;
    for (const [k, n] of counts.entries()) {
      if (n > bestN) {
        best = k;
        bestN = n;
      }
    }
    return (best === 'BYBRIDGE' ? 'BYBRIDGE' : 'BBY_SG') as 'BBY_SG' | 'BYBRIDGE';
  })();
  const issuerCfg = getInvoiceIssuerConfig(issuer);

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
      return acc;
    },
    { invoiceAmount: 0, paymentAmount: 0 },
  );
  totals.invoiceAmount = moneyRound2(totals.invoiceAmount);
  totals.paymentAmount = moneyRound2(totals.paymentAmount);

  const totalOutstandingAmount = moneyRound2(
    invoices.reduce((sum, inv) => {
      if (inv.status !== 'UNPAID') return sum;
      const invoiceDate = String(inv.issueDate ?? '').slice(0, 10);
      if (!isYmd(invoiceDate) || invoiceDate > today) return sum;
      const total = Number(inv.total) || 0;
      if (!(total > 0)) return sum;
      return sum + total;
    }, 0),
  );

  const statementNo = buildStatementNo({
    issuedAtYmd: today,
    clientCode: client.code,
    existingTitles: db.documents.filter((d) => d.type === 'SOA').map((d) => d.title),
  });
  const html = renderStatementOfAccountHtml({
    statementNo,
    issuedAt: today,
    periodFrom,
    periodTo,
    issuer: {
      issuer: issuerCfg.issuer,
      displayName: issuerCfg.displayName,
      uen: issuerCfg.uen,
      addressLine: issuerCfg.addressLine,
      tel: issuerCfg.tel,
      customerService: issuerCfg.customerService,
      email: issuerCfg.email,
      website: issuerCfg.website,
      paymentMethodsTitle: issuerCfg.paymentMethodsTitle,
      paymentMethods: issuerCfg.paymentMethods,
    },
    billTo: { name: `${client.code} ${client.name}`.trim(), address: client.address ?? undefined, email: client.email ?? undefined, phone: client.phone ?? undefined },
    lines: events,
    totals: { invoiceAmount: totals.invoiceAmount, paymentAmount: totals.paymentAmount, totalOutstandingAmount },
    overdueSummary,
    currency,
  });

  const doc = await createDocument({ type: 'SOA', title: statementNo, html });

  if (format === 'pdf') {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMediaType('print');
      await page.setContent(html, { waitUntil: ['domcontentloaded'] });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
      });
      const pdfBuf = Buffer.from(pdf);
      const filenameBase = sanitizeFilenameBase(statementNo);
      return new Response(pdfBuf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filenameBase}.pdf"`,
          'Cache-Control': 'no-store',
          'X-Document-Id': doc.id,
          'X-Statement-No': statementNo,
        },
      });
    } finally {
      await page.close().catch(() => null);
    }
  }

  return NextResponse.json({ ok: true, documentId: doc.id, statementNo, pdfUrl: `/api/documents/${encodeURIComponent(doc.id)}/pdf` });
}
