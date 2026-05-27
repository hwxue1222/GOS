import { getCurrentUser } from '@/lib/auth';
import { findClientById, findInvoiceById } from '@/lib/db';
import { buildInvoicePdf } from '@/lib/invoicePdf';
import { hasPermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(JSON.stringify({ ok: false }), { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) {
    return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status: 403 });
  }

  const { invoiceId } = await ctx.params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) {
    return new Response(JSON.stringify({ ok: false, error: 'NOT_FOUND' }), { status: 404 });
  }

  const client =
    invoice.billTo.type === 'CLIENT'
      ? await findClientById(invoice.billTo.clientId).catch(() => null)
      : null;

  const pdfBuffer = await buildInvoicePdf({ invoice, client });
  const filename = `${invoice.invoiceNo || 'invoice'}.pdf`;

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

