import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const canViewAll = hasPermission(me, 'invoices', 'viewAll');
  if (!canViewAll) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const url = new URL(req.url);
  const invoiceNo = url.searchParams.get('invoiceNo')?.trim() ?? '';
  if (!invoiceNo) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const db = await readDb();
  const invoice = db.invoices.find((x) => x.invoiceNo === invoiceNo && !(x as any).deletedAt) ?? null;
  if (!invoice) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    invoice: {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      issuer: invoice.issuer,
      currency: invoice.currency,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      billTo: invoice.billTo,
      recipients: invoice.recipients,
      createdAt: invoice.createdAt,
      createdByUserId: invoice.createdByUserId,
      sentAt: (invoice as any).sentAt ?? null,
    },
  });
}
