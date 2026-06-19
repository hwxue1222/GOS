import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';
import {
  findContractById,
  listContractTemplates,
  listSignatureRequestsByPacket,
  readDb,
} from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { renderContractHtml } from '@/lib/docTemplates';
import { digitallySignPdfIfEnabled, isPdfPkiEnabled } from '@/lib/pdfPki';

export const runtime = 'nodejs';
export const maxDuration = 60;

function requestOrigin(req: Request) {
  const h = req.headers;
  const proto = (h.get('x-forwarded-proto') ?? h.get('x-forwarded-protocol') ?? '').trim();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').trim();
  const p = proto || 'https';
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

function canAccess(user: { id: string }, contract: { createdByUserId: string }) {
  if (hasPermission(user as any, 'contracts', 'viewAll')) return true;
  if (hasPermission(user as any, 'contracts', 'viewAssigned')) return contract.createdByUserId === user.id;
  return false;
}

export async function GET(req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'viewAssigned') && !hasPermission(user, 'contracts', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const url = new URL(req.url);
  const debug = url.searchParams.get('debug') === '1';

  if (debug) {
    const hasKv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
    const hasRedis = !!process.env.REDIS_URL;
    const hasChromeEnv = !!process.env.PUPPETEER_EXECUTABLE_PATH || !!process.env.CHROME_EXECUTABLE_PATH;
    let contractExists = false;
    let canReadContract = false;
    try {
      const c = await findContractById(contractId);
      contractExists = !!c;
      canReadContract = !!c && canAccess(user, c);
    } catch {
      contractExists = false;
      canReadContract = false;
    }

    return NextResponse.json(
      {
        ok: true,
        contractId,
        vercel: !!process.env.VERCEL,
        db: {
          hasKv,
          hasRedis,
          key: process.env.GOS_KV_DB_KEY?.trim() || 'gos:db',
        },
        pdf: {
          hasChromeEnv,
        },
        contract: {
          exists: contractExists,
          canRead: canReadContract,
        },
      },
      { status: 200 },
    );
  }

  const contract = await findContractById(contractId);
  if (!contract) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, contract)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  if (!String(contract.contractNo ?? '').trim()) {
    return NextResponse.json({ ok: false, error: 'CONTRACT_NOT_GENERATED' }, { status: 409 });
  }

  const templates = await listContractTemplates();
  const tpl = templates.find((t) => t.id === contract.templateId) ?? null;
  if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  const html = renderContractHtml({
    templateHtml: tpl.templateHtml,
    contractNo: contract.contractNo,
    clientName: contract.clientName,
    clientEmail: contract.clientEmail,
    fields: contract.fields ?? {},
  });
  const origin = requestOrigin(req);
  const htmlWithBase = injectBaseHref(html, origin);
  const htmlWithAssets = await inlineContractAssets(htmlWithBase, origin);
  const title = `Contract ${contract.contractNo} - ${contract.clientName}`;

  const contentDisposition = url.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';
  const filenameBase = sanitizeFilenameBase(title || contract.contractNo);

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMediaType('print');
      await page.setContent(htmlWithAssets, { waitUntil: ['domcontentloaded'], timeout: 45000 });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 45000 }).catch(() => null);
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });

      if (contract.packetId) {
        const reqs = await listSignatureRequestsByPacket(contract.packetId);
        const items = reqs
          .filter((r) => r.status === 'SIGNED' && !!r.signedAt)
          .map((r) => ({
            signerEmail: String(r.email ?? '').trim().toLowerCase(),
            signerName: String(r.signerFullName ?? '').trim(),
            signerTitle: String(r.signerTitle ?? '').trim(),
            signedAt: String(r.signedAt ?? ''),
          }))
          .filter((x) => !!x.signerEmail && !!x.signedAt);

        await page.evaluate(async (signed) => {
          if (document.fonts?.ready) await document.fonts.ready;
          if (!signed?.length) return;

          const toYmdHm = (iso: string) => {
            const d = new Date(String(iso || ''));
            if (Number.isNaN(d.getTime())) return String(iso || '');
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          };

          const placeholders = Array.from(document.querySelectorAll('[data-signer]')) as HTMLElement[];
          const nameEls = Array.from(document.querySelectorAll('[data-signer-full-name]')) as HTMLElement[];
          const titleEls = Array.from(document.querySelectorAll('[data-signer-title]')) as HTMLElement[];
          const timeEls = Array.from(document.querySelectorAll('[data-signer-signed-at]')) as HTMLElement[];

          const byEmail = new Map<string, HTMLElement>();
          for (const el of placeholders) {
            const k = String(el.getAttribute('data-signer') || '').toLowerCase();
            if (k) byEmail.set(k, el);
          }
          const byEmailName = new Map<string, HTMLElement>();
          for (const el of nameEls) {
            const k = String(el.getAttribute('data-signer-full-name') || '').toLowerCase();
            if (k) byEmailName.set(k, el);
          }
          const byEmailTitle = new Map<string, HTMLElement>();
          for (const el of titleEls) {
            const k = String(el.getAttribute('data-signer-title') || '').toLowerCase();
            if (k) byEmailTitle.set(k, el);
          }
          const byEmailTime = new Map<string, HTMLElement>();
          for (const el of timeEls) {
            const k = String(el.getAttribute('data-signer-signed-at') || '').toLowerCase();
            if (k) byEmailTime.set(k, el);
          }

          for (const it of signed) {
            const key = String(it.signerEmail || '').toLowerCase();
            if (!key) continue;
            const signedAtText = toYmdHm(String(it.signedAt || ''));
            const name = String(it.signerName || '').trim();
            const title = String(it.signerTitle || '').trim();

            const el = byEmail.get(key);
            if (el) {
              const email = String(it.signerEmail || '').trim();
              el.textContent = email
                ? `Signed ${signedAtText}${name ? ' - ' + name : ''}${title ? ' (' + title + ')' : ''} (${email})`
                : `Signed ${signedAtText}${name ? ' - ' + name : ''}${title ? ' (' + title + ')' : ''}`;
            }

            const nameEl = byEmailName.get(key);
            if (nameEl) nameEl.textContent = name;
            const titleEl = byEmailTitle.get(key);
            if (titleEl) titleEl.textContent = title;
            const timeEl = byEmailTime.get(key);
            if (timeEl) timeEl.textContent = signedAtText;
          }
        }, items);
      }

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%;font-size:9px;color:#666;padding:0 12mm;display:flex;justify-content:flex-end;font-family:ui-sans-serif,system-ui;">' +
          'Page <span class="pageNumber"></span> / <span class="totalPages"></span>' +
          '</div>',
        margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
      });

      const pdfBuffer = Buffer.from(pdf);
      const db = await readDb();
      const packet = contract.packetId ? db.signaturePackets.find((p) => p.id === contract.packetId) ?? null : null;
      const shouldPkiSign = packet?.status === 'SIGNED';
      const signedPdfBuffer = await digitallySignPdfIfEnabled({
        pdf: pdfBuffer,
        shouldSign: shouldPkiSign,
        signingTime: contract.signedAt ? new Date(contract.signedAt) : undefined,
      });

      return new NextResponse(signedPdfBuffer as any, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `${contentDisposition}; filename="${filenameBase}.pdf"`,
          'cache-control': 'no-store',
          ...(isPdfPkiEnabled() && shouldPkiSign ? { 'x-pdf-digital-signature': 'pki' } : {}),
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
