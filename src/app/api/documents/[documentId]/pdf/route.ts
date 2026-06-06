import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
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

async function getBrowser() {
  const g = globalThis as unknown as { __gosDocPdfBrowserPromise?: Promise<Browser> };
  if (!g.__gosDocPdfBrowserPromise) {
    g.__gosDocPdfBrowserPromise = (async () => {
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
  return g.__gosDocPdfBrowserPromise;
}

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
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
  }

  return false;
}

export async function GET(_req: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { documentId } = await ctx.params;
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId) ?? null;
  if (!doc) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (user.role === 'client') {
    const ok = await canClientAccessDocument(user, documentId);
    if (!ok) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const cacheKey = `docPdf:${documentId}:${doc.sha256}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    const filenameBase = sanitizeFilenameBase(doc.title || doc.id);
    return new Response(new Blob([toArrayBuffer(cached)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType('print');
    await page.setContent(doc.html, { waitUntil: ['domcontentloaded'] });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    cacheSet(cacheKey, Buffer.from(pdf));
    const filenameBase = sanitizeFilenameBase(doc.title || doc.id);
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

