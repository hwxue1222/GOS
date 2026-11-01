import { NextResponse } from 'next/server';
import { findClientById, findInvoiceByPublicToken } from '@/lib/db';
import { buildInvoicePdfBuffer } from '@/lib/invoicePdfRenderer';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'invoice';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

function toArrayBuffer(bytes: Uint8Array) {
  const ab = bytes.buffer as ArrayBuffer;
  return ab.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invoice = await findInvoiceByPublicToken(token);
  if (!invoice || invoice.deletedAt) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  const cacheKey = `publicInvoicePdf:v2:${token}:${invoice.updatedAt}`;
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

  const client =
    invoice.billTo.type === 'CLIENT'
      ? await findClientById(invoice.billTo.clientId).catch(() => null)
      : null;

  try {
    const pdf = await buildInvoicePdfBuffer({ invoice, client });
    cacheSet(cacheKey, pdf);
    const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
    return new Response(new Blob([toArrayBuffer(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
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
