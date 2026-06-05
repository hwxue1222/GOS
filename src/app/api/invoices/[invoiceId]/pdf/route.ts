import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceById } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { Browser } from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PdfCache = Map<string, Buffer>;

function getPdfCache(): PdfCache {
  const g = globalThis as unknown as { __gosPdfCache?: PdfCache };
  if (!g.__gosPdfCache) g.__gosPdfCache = new Map();
  return g.__gosPdfCache;
}

function cacheGet(key: string) {
  const cache = getPdfCache();
  const v = cache.get(key);
  if (!v) return null;
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function cacheSet(key: string, value: Buffer) {
  const cache = getPdfCache();
  cache.set(key, value);
  const max = 20;
  while (cache.size > max) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'invoice';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

function toArrayBuffer(bytes: Uint8Array) {
  const ab = bytes.buffer as ArrayBuffer;
  return ab.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function getBrowser() {
  const g = globalThis as unknown as { __gosPdfBrowserPromise?: Promise<Browser> };
  if (!g.__gosPdfBrowserPromise) {
    g.__gosPdfBrowserPromise = (async () => {
      const chromiumMod = await import('@sparticuz/chromium');
      const puppeteerMod = await import('puppeteer-core');
      const chromium = chromiumMod.default ?? chromiumMod;
      const puppeteer = puppeteerMod.default ?? puppeteerMod;

      const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_EXECUTABLE_PATH?.trim();
      const macCandidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
      const candidate = envPath || macCandidates.find((p) => fs.existsSync(p)) || null;
      const executablePath = candidate || (await chromium.executablePath());
      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    })();
  }
  return g.__gosPdfBrowserPromise;
}

export async function GET(req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { invoiceId } = await ctx.params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const cacheKey = `invoicePdf:${invoiceId}:${invoice.updatedAt}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
    return new Response(new Blob([toArrayBuffer(cached)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const origin = new URL(req.url).origin;
  const printUrl = `${origin}/invoices/${encodeURIComponent(invoiceId)}/print`;
  const cookie = req.headers.get('cookie') ?? '';

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.emulateMediaType('print');
    await page.goto(printUrl, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 45_000 });
    await page.waitForSelector('#invoice-print-root', { timeout: 20_000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    cacheSet(cacheKey, Buffer.from(pdf));

    const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
    return new Response(new Blob([toArrayBuffer(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await page.close();
  }
}
