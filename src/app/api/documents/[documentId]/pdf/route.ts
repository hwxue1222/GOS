import { NextResponse } from 'next/server';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { digitallySignPdfIfEnabled, isPdfPkiEnabled } from '@/lib/pdfPki';
import type { Browser } from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PdfCache = Map<string, Buffer>;

function getPdfCache(): PdfCache {
  const g = globalThis as unknown as { __gosDocPdfCache?: PdfCache };
  if (!g.__gosDocPdfCache) g.__gosDocPdfCache = new Map();
  return g.__gosDocPdfCache;
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
  const max = 40;
  while (cache.size > max) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'document';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

function toArrayBuffer(bytes: Uint8Array) {
  const ab = bytes.buffer as ArrayBuffer;
  return ab.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function computeAgmFiscalYearEndDisplay(input: { year: string; fye: string }) {
  const year = String(input.year ?? '').trim();
  if (!/^\d{4}$/.test(year)) return '';
  const fye = String(input.fye ?? '').trim();
  const m = fye.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return '';
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || dd < 1 || dd > 31 || mm < 1 || mm > 12) return '';
  return `${dd}/${mm}/${year}`;
}

function addDaysYmd(ymd: string, deltaDays: number) {
  const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function ymdToDmy(ymd: string) {
  const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function replaceYearEndedIso(html: string, fiscalYearEnd: string) {
  const lower = html.toLowerCase();
  const needle = 'year ended';
  let start = 0;
  let out = html;
  while (true) {
    const idx = lower.indexOf(needle, start);
    if (idx < 0) break;
    const windowStart = idx;
    const windowEnd = Math.min(out.length, idx + 120);
    const seg = out.slice(windowStart, windowEnd);
    const m = seg.match(/\d{4}[-‑–—]\d{2}[-‑–—]\d{2}/);
    if (m?.[0]) {
      out = out.slice(0, windowStart) + seg.replace(m[0], fiscalYearEnd) + out.slice(windowEnd);
      start = idx + needle.length;
      continue;
    }
    start = idx + needle.length;
  }
  return out;
}

async function getBrowser() {
  const g = globalThis as unknown as { __gosDocPdfBrowserPromise?: Promise<Browser> };
  if (!g.__gosDocPdfBrowserPromise) {
    g.__gosDocPdfBrowserPromise = (async () => {
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
  return g.__gosDocPdfBrowserPromise;
}

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canClientAccessDocument(user: { email: string }, documentId: string) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId) ?? null;
  if (!doc) return false;

  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const allowedClientIds = new Set<string>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    allowedClientIds.add(r.clientId);
  }

  const relatedPackets = db.signaturePackets.filter((p) => p.documentId === documentId);
  for (const p of relatedPackets) {
    if (p.relatedType === 'DIRECTOR_CHANGE') {
      const dcr = (db.directorChangeRequests ?? []).find((x) => x.id === p.relatedId) ?? null;
      if (dcr && allowedClientIds.has(dcr.clientId)) return true;
    }
    if (p.relatedType === 'SHARE_TRANSFER') {
      const st = db.shareTransfers.find((x) => x.id === p.relatedId) ?? null;
      if (st && allowedClientIds.has(st.clientId)) return true;
    }
    if (p.relatedType === 'RDR') {
      const rdr = db.representativeDesignationRequests.find((x) => x.id === p.relatedId) ?? null;
      if (!rdr) continue;
      const companyParty = db.parties.find((x) => x.id === rdr.companyPartyId) ?? null;
      if (!companyParty || !companyParty.clientId) continue;
      if (allowedClientIds.has(companyParty.clientId)) return true;
    }
    if (p.relatedType === 'COMPANY_UPDATE') {
      const cur = (db.companyUpdateRequests ?? []).find((x) => x.id === p.relatedId) ?? null;
      if (cur && allowedClientIds.has(cur.clientId)) return true;
    }
    if (p.relatedType === 'RORC_DECLARATION') {
      const rorc = (db.rorcDeclarationRequests ?? []).find((x) => x.id === p.relatedId) ?? null;
      if (rorc && allowedClientIds.has(rorc.clientId)) return true;
    }
    if (p.relatedType === 'ANNUAL_GENERAL_MEETING') {
      const agm = (db.annualGeneralMeetingRequests ?? []).find((x) => x.id === p.relatedId) ?? null;
      if (agm && allowedClientIds.has(agm.clientId)) return true;
    }
  }

  return false;
}

export async function GET(req: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { documentId } = await ctx.params;
  const url = new URL(req.url);
  const dispositionParam = (url.searchParams.get('disposition') ?? '').toLowerCase();
  const inlineParam = (url.searchParams.get('inline') ?? '').toLowerCase();
  const downloadParam = (url.searchParams.get('download') ?? '').toLowerCase();
  const contentDisposition: 'inline' | 'attachment' =
    dispositionParam === 'inline' || inlineParam === '1' || downloadParam === '0' ? 'inline' : 'attachment';

  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId) ?? null;
  if (!doc) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (user.role === 'client') {
    const ok = await canClientAccessDocument(user, documentId);
    if (!ok) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const packets = db.signaturePackets
    .filter((p) => p.documentId === documentId)
    .slice()
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')));
  const packet = packets[0] ?? null;
  const packetId = packet?.id ?? '';
  const packetReqs = packetId ? db.signatureRequests.filter((r) => r.packetId === packetId) : [];
  const sigVersion = (() => {
    const times: string[] = [];
    if (packet?.createdAt) times.push(packet.createdAt);
    if (packet?.updatedAt) times.push(packet.updatedAt);
    for (const r of packetReqs) {
      if (r.createdAt) times.push(r.createdAt);
      if (r.updatedAt) times.push(r.updatedAt);
      if (r.signedAt) times.push(r.signedAt);
    }
    times.sort();
    return times[times.length - 1] ?? '';
  })();

  const signatureHash = (() => {
    const base = `${documentId}:${doc.sha256}:${packetId}:${sigVersion}`;
    return crypto.createHash('sha256').update(base).digest('hex');
  })();

  const html = (() => {
    let out = doc.html;
    const isAgm = doc.type === 'AGM_MIN' || doc.type === 'AGM_NOTICE' || doc.type === 'AGM_DIR_STMT';
    if (!isAgm) return out;

    if (out.includes('</style>')) {
      out = out.replace(
        '</style>',
        'p[align="center"] { margin-top: 0in !important; margin-bottom: 0in !important; }\n</style>',
      );
    }

    out = out
      .replaceAll('color="#ee0000"', 'color="#111111"')
      .replaceAll('color="#ff0000"', 'color="#111111"')
      .replaceAll('color="#EE0000"', 'color="#111111"')
      .replaceAll('color="#FF0000"', 'color="#111111"')
      .replaceAll('color:#ee0000', 'color:#111111')
      .replaceAll('color:#ff0000', 'color:#111111');

    if (packet?.relatedType === 'ANNUAL_GENERAL_MEETING') {
      const agm = (db.annualGeneralMeetingRequests ?? []).find((x) => x.id === packet.relatedId) ?? null;
      const client = agm ? db.clients.find((c) => c.id === agm.clientId && !c.deletedAt) ?? null : null;

      if (client?.name) {
        const upper = client.name.toUpperCase();
        out = out.replaceAll(client.name, upper);
      }
      const fiscalYearEnd = agm && client ? computeAgmFiscalYearEndDisplay({ year: String(agm.fiscalYearReport ?? ''), fye: String(client.fye ?? '') }) : '';
      if (fiscalYearEnd) {
        const variants = ['2026-11-30', '2026‑11‑30', '2026–11–30', '2026—11—30'];
        for (const v of variants) out = out.replaceAll(v, fiscalYearEnd);
        out = replaceYearEndedIso(out, fiscalYearEnd);
      }

      if (doc.type === 'AGM_NOTICE' && agm?.meetingDate) {
        const noticeYmd = addDaysYmd(String(agm.meetingDate), -14);
        const noticeDmy = noticeYmd ? ymdToDmy(noticeYmd) : '';
        if (noticeDmy) {
          out = out.replace(
            /(Dated:\s*(?:<[^>]+>)*)(\d{1,2}\/\d{1,2}\/\d{4})/i,
            (_all, prefix) => `${prefix}${noticeDmy}`,
          );
        }
      }
    }

    return out;
  })();

  const isAgmDoc = doc.type === 'AGM_MIN' || doc.type === 'AGM_NOTICE' || doc.type === 'AGM_DIR_STMT';
  const agmKey = (() => {
    if (!isAgmDoc) return '';
    if (packet?.relatedType !== 'ANNUAL_GENERAL_MEETING') return '';
    const agm = (db.annualGeneralMeetingRequests ?? []).find((x) => x.id === packet.relatedId) ?? null;
    const client = agm ? db.clients.find((c) => c.id === agm.clientId && !c.deletedAt) ?? null : null;
    const fiscalYearEnd = agm && client ? computeAgmFiscalYearEndDisplay({ year: String(agm.fiscalYearReport ?? ''), fye: String(client.fye ?? '') }) : '';
    const noticeYmd = doc.type === 'AGM_NOTICE' && agm?.meetingDate ? addDaysYmd(String(agm.meetingDate), -14) : '';
    const noticeDmy = noticeYmd ? ymdToDmy(noticeYmd) : '';
    return [fiscalYearEnd ? `fye:${fiscalYearEnd}` : '', noticeDmy ? `notice:${noticeDmy}` : ''].filter(Boolean).join('|');
  })();
  const renderVersion = isAgmDoc ? 'v4' : 'v1';
  const cacheKey = `docPdf:${renderVersion}:${agmKey}:${documentId}:${doc.sha256}:${packetId}:${sigVersion}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    const filenameBase = sanitizeFilenameBase(doc.title || doc.id);
    return new Response(new Blob([toArrayBuffer(cached)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${contentDisposition}; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMediaType('print');
      await page.setContent(html, { waitUntil: ['domcontentloaded'] });
      const signed = packetReqs
        .filter((r) => r.status === 'SIGNED' && !!r.signedAt)
        .map((r) => ({
          signerEmail: String(r.email ?? '').trim().toLowerCase(),
          signerName: String(r.signerFullName ?? r.rdrRepresentativeName ?? '').trim(),
          signerTitle: String(r.signerTitle ?? '').trim(),
          signedAt: String(r.signedAt ?? ''),
        }))
        .filter((x) => !!x.signerEmail && !!x.signedAt);

      try {
        await page.evaluate(
          async (items) => {
            if (document.fonts?.ready) await document.fonts.ready;
            if (!items?.length) return;

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
            if (placeholders.length) {
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

              for (const it of items) {
                const key = String(it.signerEmail || '').toLowerCase();
                if (!key) continue;
                const el = byEmail.get(key);
                if (!el) continue;
                const email = String(it.signerEmail || '').trim();

                const signedAtText = toYmdHm(String(it.signedAt || ''));
                const name = String(it.signerName || '').trim();
                const title = String(it.signerTitle || '').trim();
                el.textContent = email
                  ? `Signed ${signedAtText}${name ? ' - ' + name : ''}${title ? ' (' + title + ')' : ''} (${email})`
                  : `Signed ${signedAtText}${name ? ' - ' + name : ''}${title ? ' (' + title + ')' : ''}`;

                const nameEl = byEmailName.get(key);
                if (nameEl) nameEl.textContent = name;
                const titleEl = byEmailTitle.get(key);
                if (titleEl) titleEl.textContent = title;
                const timeEl = byEmailTime.get(key);
                if (timeEl) timeEl.textContent = signedAtText;
              }
              return;
            }

            const box = document.createElement('div');
            box.style.marginTop = '24px';
            box.style.fontSize = '12px';
            box.style.color = '#111';
            const title = document.createElement('div');
            title.style.fontWeight = '700';
            title.textContent = 'Signatures';
            box.appendChild(title);
            for (const it of items) {
              const row = document.createElement('div');
              row.style.marginTop = '6px';
              const name = String(it.signerName || '').trim();
              const email = String(it.signerEmail || '').trim();
              row.textContent = `${name ? name + ' ' : ''}<${email}> - ${toYmdHm(String(it.signedAt || ''))}`;
              box.appendChild(row);
            }
            document.body.appendChild(box);
          },
          signed,
        );
      } catch {
        await page.evaluate(async () => {
          if (document.fonts?.ready) await document.fonts.ready;
        });
      }

      await page.evaluate(
        ({ docHash, sigHash }) => {
          const existing = document.getElementById('gos-doc-hashes');
          if (existing) return;
          const el = document.createElement('div');
          el.id = 'gos-doc-hashes';
          el.style.position = 'fixed';
          el.style.left = '16px';
          el.style.bottom = '12px';
          el.style.fontSize = '9px';
          el.style.color = '#666';
          el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          el.style.whiteSpace = 'pre-wrap';
          el.style.maxWidth = '95%';
          el.textContent = `Document hash: ${docHash}\nSignature hash: ${sigHash}`;
          document.body.appendChild(el);
        },
        { docHash: doc.sha256, sigHash: signatureHash },
      );

      const isContractDoc = doc.type === 'CONTRACT';
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        ...(isContractDoc
          ? {
              displayHeaderFooter: true,
              headerTemplate: '<div></div>',
              footerTemplate:
                '<div style="width:100%;font-size:9px;color:#666;padding:0 12mm;display:flex;justify-content:flex-end;font-family:ui-sans-serif,system-ui;">' +
                'Page <span class="pageNumber"></span> / <span class="totalPages"></span>' +
                '</div>',
              margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
            }
          : {}),
      });

      const pdfBuffer = Buffer.from(pdf);
      const shouldPkiSign = packet?.status === 'SIGNED';
      const signedPdfBuffer = await digitallySignPdfIfEnabled({
        pdf: pdfBuffer,
        shouldSign: shouldPkiSign,
        signingTime: sigVersion ? new Date(sigVersion) : undefined,
      });

      cacheSet(cacheKey, signedPdfBuffer);
      const filenameBase = sanitizeFilenameBase(doc.title || doc.id);
      return new Response(new Blob([toArrayBuffer(signedPdfBuffer)], { type: 'application/pdf' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${contentDisposition}; filename="${filenameBase}.pdf"`,
          'Cache-Control': 'no-store',
          ...(isPdfPkiEnabled() && shouldPkiSign ? { 'X-Pdf-Digital-Signature': 'pki' } : {}),
        },
      });
    } finally {
      await page.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('CHROME_NOT_FOUND'))
      return NextResponse.json({ ok: false, error: 'CHROME_NOT_FOUND', message: 'Set PUPPETEER_EXECUTABLE_PATH / CHROME_EXECUTABLE_PATH to enable PDF generation.' }, { status: 500 });
    return NextResponse.json({ ok: false, error: 'PDF_FAILED', message: msg }, { status: 500 });
  }
}
