import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { listContractTemplates } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { renderContractHtml } from '@/lib/docTemplates';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

async function inlineContractAssets(html: string, origin: string) {
  if (!origin) return html;
  const matches = Array.from(html.matchAll(/<img\b[^>]*\ssrc="(\/contracts\/[^"?]+\.(?:png|jpg|jpeg|svg|webp|gif))"[^>]*>/gi));
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

function injectInlinePdfFonts(html: string) {
  const g = globalThis as unknown as { __gosInlinePdfFontCss?: string };
  if (!g.__gosInlinePdfFontCss) {
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
      g.__gosInlinePdfFontCss = `<style>${faces}body,body *{font-family:var(--gos-font,'Times New Roman','NotoSansSC_Inline','NotoSansSC','Noto Sans SC','PingFang SC','Microsoft YaHei',serif) !important;}</style>`;
    } catch {
      g.__gosInlinePdfFontCss = '';
    }
  }

  if (!g.__gosInlinePdfFontCss) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${g.__gosInlinePdfFontCss}</head>`);
  return `${g.__gosInlinePdfFontCss}${html}`;
}

async function getBrowser() {
  const g = globalThis as unknown as { __gosContractPdfBrowserPromise?: Promise<Browser> };
  if (!g.__gosContractPdfBrowserPromise) {
    g.__gosContractPdfBrowserPromise = (async () => {
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
  return g.__gosContractPdfBrowserPromise;
}

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'document';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (
    !hasPermission(user, 'contracts', 'create') &&
    !hasPermission(user, 'contracts', 'update') &&
    !hasPermission(user, 'contracts', 'viewAll') &&
    !hasPermission(user, 'contracts', 'viewAssigned')
  ) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { templateId?: string; clientName?: string; clientEmail?: string; fields?: Record<string, string>; title?: string }
    | null;
  const templateId = String(body?.templateId ?? '').trim();
  const clientName = String(body?.clientName ?? '').trim();
  const clientEmail = String(body?.clientEmail ?? '').trim();
  const fields = (body?.fields ?? {}) as Record<string, string>;
  const customTitle = String(body?.title ?? '').trim();

  if (!templateId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const templates = await listContractTemplates();
  const tpl = templates.find((t) => t.id === templateId) ?? null;
  if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  const html = renderContractHtml({
    templateHtml: tpl.templateHtml,
    contractNo: '',
    clientName,
    clientEmail,
    fields,
  });
  const origin = requestOrigin(req);
  const htmlWithBase = injectBaseHref(html, origin);
  const htmlWithAssets = await inlineContractAssets(htmlWithBase, origin);
  const htmlWithFonts = injectInlinePdfFonts(htmlWithAssets);

  const date = String((fields as any).date ?? '').trim() || new Date().toISOString().slice(0, 10);
  const filenameBase = sanitizeFilenameBase(customTitle || `${tpl.name}-${clientName || 'Client'}-${date}`);

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMediaType('print');
      await page.setContent(htmlWithFonts, { waitUntil: ['domcontentloaded'], timeout: 45000 });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 45000 }).catch(() => null);
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${filenameBase}.pdf"`,
        },
      });
    } finally {
      await page.close().catch(() => null);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'FAILED', message: msg }, { status: 500 });
  }
}
