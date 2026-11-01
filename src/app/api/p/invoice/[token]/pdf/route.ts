import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { findInvoiceByPublicToken } from '@/lib/db';
import type { Browser } from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const g = globalThis as unknown as { __gosPublicInvoiceInlinePdfFontCss?: string };
  if (!g.__gosPublicInvoiceInlinePdfFontCss) {
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
      g.__gosPublicInvoiceInlinePdfFontCss = `<style>${faces}body,body *{font-family:'NotoSansSC_Inline','Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif !important;}</style>`;
    } catch {
      g.__gosPublicInvoiceInlinePdfFontCss = '';
    }
  }
  const css = g.__gosPublicInvoiceInlinePdfFontCss || '';
  if (!css) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${css}</head>`);
  return `${css}${html}`;
}

function contentTypeFromPath(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

async function inlineInvoiceAssets(html: string) {
  const matches = Array.from(html.matchAll(/<img\b[^>]*\ssrc="(\/[^"?]+\.(?:png|jpg|jpeg|svg|webp|gif))"[^>]*>/gi));
  const unique = Array.from(new Set(matches.map((m) => m[1])));
  if (unique.length === 0) return html;

  let out = html;
  for (const src of unique) {
    try {
      const filePath = path.join(process.cwd(), 'public', src.replace(/^\/+/, ''));
      if (!fs.existsSync(filePath)) continue;
      const b64 = fs.readFileSync(filePath).toString('base64');
      const mime = contentTypeFromPath(filePath);
      out = out.replaceAll(`src="${src}"`, `src="data:${mime};base64,${b64}"`);
    } catch {
      continue;
    }
  }
  return out;
}

type PdfCache = Map<string, Buffer>;

function getPdfCache(): PdfCache {
  const g = globalThis as unknown as { __gosPublicInvoicePdfCache?: PdfCache };
  if (!g.__gosPublicInvoicePdfCache) g.__gosPublicInvoicePdfCache = new Map();
  return g.__gosPublicInvoicePdfCache;
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

async function getBrowser() {
  const g = globalThis as unknown as { __gosPublicInvoicePdfBrowserPromise?: Promise<Browser> };
  if (!g.__gosPublicInvoicePdfBrowserPromise) {
    g.__gosPublicInvoicePdfBrowserPromise = (async () => {
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
  return g.__gosPublicInvoicePdfBrowserPromise;
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invoice = await findInvoiceByPublicToken(token);
  if (!invoice || invoice.deletedAt) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  const cacheKey = `publicInvoicePdf:${token}:${invoice.updatedAt}`;
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
  const printUrl = `${origin}/p/invoice/${encodeURIComponent(token)}`;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMediaType('print');
      const printRes = await fetch(printUrl, { cache: 'no-store' });
      if (!printRes.ok) {
        return NextResponse.json({ ok: false, error: 'PRINT_PAGE_FAILED', message: `status ${printRes.status}` }, { status: 500 });
      }
      let html = await printRes.text();
      html = injectBaseHref(html, origin);
      html = injectInlinePdfFonts(html);
      html = await inlineInvoiceAssets(html);
      if (!html.includes('invoice-print-root')) {
        return NextResponse.json({ ok: false, error: 'PRINT_ROOT_MISSING' }, { status: 500 });
      }
      await page.setContent(html, { waitUntil: ['domcontentloaded'] });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
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

      const pdfBuffer = Buffer.from(pdf);
      cacheSet(cacheKey, pdfBuffer);

      const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
      return new Response(new Blob([toArrayBuffer(pdfBuffer)], { type: 'application/pdf' }), {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('CHROME_NOT_FOUND')) {
      return NextResponse.json(
        { ok: false, error: 'CHROME_NOT_FOUND', message: 'Set PUPPETEER_EXECUTABLE_PATH / CHROME_EXECUTABLE_PATH to enable PDF generation.' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, error: 'PDF_FAILED', message: msg }, { status: 500 });
  }
}
