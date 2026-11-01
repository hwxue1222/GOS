import { NextResponse } from 'next/server';
import { findClientById, findInvoiceByPublicToken } from '@/lib/db';
import { buildInvoicePdf } from '@/lib/invoicePdf';

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

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invoice = await findInvoiceByPublicToken(token);
  if (!invoice || invoice.deletedAt) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  const client =
    invoice.billTo.type === 'CLIENT'
      ? await findClientById(invoice.billTo.clientId).catch(() => null)
      : null;

  const pdf = await buildInvoicePdf({ invoice, client });
  const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);

  return new Response(new Blob([toArrayBuffer(pdf)], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
