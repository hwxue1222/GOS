import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceById } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'invoice';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

async function resolveChromeExecutablePath(chromium: any) {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (envPath) return envPath;

  const chromiumPath = await chromium.executablePath();
  if (chromiumPath) return chromiumPath;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { invoiceId } = await ctx.params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const origin = new URL(req.url).origin;
  const printUrl = `${origin}/invoices/${encodeURIComponent(invoiceId)}/print`;
  const cookie = req.headers.get('cookie') ?? '';

  const chromiumMod = await import('@sparticuz/chromium');
  const puppeteerMod = await import('puppeteer-core');
  const chromium = chromiumMod.default ?? chromiumMod;
  const puppeteer = puppeteerMod.default ?? puppeteerMod;

  const executablePath = await resolveChromeExecutablePath(chromium);
  if (!executablePath) {
    return NextResponse.json({ ok: false, error: 'PDF_ENGINE_NOT_AVAILABLE' }, { status: 500 });
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.emulateMediaType('print');
    await page.goto(printUrl, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 45_000 });
    await page.waitForSelector('body', { timeout: 10_000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await browser.close();
  }
}
