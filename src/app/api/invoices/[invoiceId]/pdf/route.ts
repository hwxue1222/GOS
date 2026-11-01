import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
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

function requestOrigin(req: Request) {
  const h = req.headers;
  const proto = (h.get('x-forwarded-proto') ?? h.get('x-forwarded-protocol') ?? '').trim();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').trim();
  const urlProto = (() => {
    try {
      return new URL(req.url).protocol.replace(':', '');
    } catch {
      return '';
    }
  })();
  const p = proto || urlProto || 'https';
  if (!host) return '';
  return `${p}://${host}`;
}

function injectBaseHref(html: string, origin: string) {
  if (!origin) return html;
  if (/<base\s+/i.test(html)) return html;
  const baseTag = `<base href="${origin.replace(/\/$/, '')}/" />`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${baseTag}`);
  return `${baseTag}${html}`;
}

function injectInlinePdfFonts(html: string) {
  const g = globalThis as unknown as { __gosInvoiceInlinePdfFontCss?: string };
  if (!g.__gosInvoiceInlinePdfFontCss) {
    try {
      const regularPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.otf');
      const boldPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Bold.otf');
      const regular = fs.existsSync(regularPath) ? fs.readFileSync(regularPath).toString('base64') : '';
      const bold = fs.existsSync(boldPath) ? fs.readFileSync(boldPath).toString('base64') : '';
      const faces = [
        regular
          ? `@font-face{font-family:'NotoSansSC_Inline';src:url('data:font/otf;base64,${regular}') format('opentype');font-weight:400;font-style:normal;}`
          : '',
        bold
          ? `@font-face{font-family:'NotoSansSC_Inline';src:url('data:font/otf;base64,${bold}') format('opentype');font-weight:700;font-style:normal;}`
          : '',
      ]
        .filter(Boolean)
        .join('');
      g.__gosInvoiceInlinePdfFontCss = `<style>${faces}body,body *{font-family:'NotoSansSC_Inline','Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif !important;}</style>`;
    } catch {
      g.__gosInvoiceInlinePdfFontCss = '';
    }
  }

  if (!g.__gosInvoiceInlinePdfFontCss) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${g.__gosInvoiceInlinePdfFontCss}</head>`);
  return `${g.__gosInvoiceInlinePdfFontCss}${html}`;
}

async function inlineInvoiceAssets(html: string, origin: string) {
  if (!origin) return html;
  const matches = Array.from(html.matchAll(/<img\b[^>]*\ssrc="(\/[^"?]+\.(?:png|jpg|jpeg|svg|webp|gif))"[^>]*>/gi));
  const unique = Array.from(new Set(matches.map((m) => m[1])));
  if (unique.length === 0) return html;

  const map = new Map<string, string>();
  for (const src of unique) {
    try {
      const res = await fetch(`${origin.replace(/\/$/, '')}${src}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      const ab = await res.arrayBuffer();
      const b64 = Buffer.from(ab).toString('base64');
      const mime = contentType.includes('/') ? contentType.split(';')[0] : 'image/png';
      map.set(src, `data:${mime};base64,${b64}`);
    } catch {
      continue;
    }
  }

  let out = html;
  for (const [src, dataUri] of map.entries()) {
    out = out.replaceAll(`src="${src}"`, `src="${dataUri}"`);
  }
  return out;
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

  const origin = requestOrigin(req) || new URL(req.url).origin;
  const printUrl = `${origin}/invoices/${encodeURIComponent(invoiceId)}/print`;
  const cookie = req.headers.get('cookie') ?? '';

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType('print');
    const printRes = await fetch(printUrl, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    if (!printRes.ok) {
      return NextResponse.json({ ok: false, error: 'PRINT_PAGE_FAILED' }, { status: 500 });
    }
    let html = await printRes.text();
    html = injectBaseHref(html, origin);
    html = injectInlinePdfFonts(html);
    html = await inlineInvoiceAssets(html, origin);
    await page.setContent(html, { waitUntil: ['domcontentloaded'] });
    await page.waitForSelector('#invoice-print-root', { timeout: 20_000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
      );
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
