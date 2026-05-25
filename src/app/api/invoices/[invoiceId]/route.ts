import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteInvoice, findInvoiceById, updateInvoice } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { Currency, Invoice, InvoiceItem, InvoiceStatus } from '@/lib/types';

function safeNumber(v: unknown) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function normalizeItems(input: unknown): InvoiceItem[] {
  if (!Array.isArray(input)) return [];
  const out: InvoiceItem[] = [];
  for (const raw of input) {
    const r = raw as Partial<InvoiceItem> | null;
    const description = typeof r?.description === 'string' ? r.description.trim() : '';
    const qty = safeNumber(r?.qty);
    const unitPrice = safeNumber(r?.unitPrice);
    if (!description) continue;
    out.push({
      id: typeof r?.id === 'string' && r.id.trim() ? r.id.trim() : globalThis.crypto?.randomUUID?.() ?? `it_${Math.random().toString(16).slice(2)}`,
      description,
      qty: round2(Math.max(0, qty)),
      unitPrice: round2(Math.max(0, unitPrice)),
    });
  }
  return out;
}

function computeTotals(items: InvoiceItem[], discount: number, tax: number) {
  const subtotal = round2(items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0));
  const safeDiscount = round2(Math.max(0, discount));
  const safeTax = round2(Math.max(0, tax));
  const total = round2(Math.max(0, subtotal - safeDiscount + safeTax));
  return { subtotal, discount: safeDiscount, tax: safeTax, total };
}

export async function GET(_req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { invoiceId } = await ctx.params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, invoice });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { invoiceId } = await ctx.params;
  const current = await findInvoiceById(invoiceId);
  if (!current || current.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | {
        invoiceNo?: string;
        clientId?: string;
        jobId?: string | null;
        issueDate?: string;
        dueDate?: string | null;
        currency?: Currency;
        status?: InvoiceStatus;
        items?: unknown;
        discount?: unknown;
        tax?: unknown;
        notes?: string | null;
        paidAt?: string | null;
      }
    | null;

  const wantsStatusChange = typeof body?.status === 'string' && body.status !== current.status;
  if (wantsStatusChange) {
    if (!hasPermission(user, 'invoices', 'markPaid')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  } else if (!hasPermission(user, 'invoices', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const invoiceNo = body?.invoiceNo?.trim() ? body!.invoiceNo!.trim() : current.invoiceNo;
  const clientId = body?.clientId?.trim() ? body!.clientId!.trim() : current.clientId;
  const issueDate = body?.issueDate?.trim() ? body!.issueDate!.trim() : current.issueDate;
  const dueDate =
    body && 'dueDate' in body ? (body.dueDate ? String(body.dueDate).trim() || undefined : undefined) : current.dueDate;
  const jobId =
    body && 'jobId' in body ? (body.jobId ? String(body.jobId).trim() || undefined : undefined) : current.jobId;
  const currency: Currency = body?.currency ?? current.currency;
  const status: InvoiceStatus = body?.status ?? current.status;
  const items = body && 'items' in body ? normalizeItems(body.items) : current.items;
  const discount = body && 'discount' in body ? safeNumber(body.discount) : current.discount ?? 0;
  const tax = body && 'tax' in body ? safeNumber(body.tax) : current.tax ?? 0;
  const notes = body && 'notes' in body ? (body.notes ? String(body.notes).trim() || undefined : undefined) : current.notes;

  const totals = computeTotals(items, discount, tax);
  const now = new Date().toISOString();
  const paidAt =
    status === 'PAID'
      ? body && 'paidAt' in body
        ? body.paidAt
          ? String(body.paidAt).trim() || now
          : now
        : current.paidAt ?? now
      : undefined;

  const next: Omit<Invoice, 'updatedAt'> = {
    ...current,
    invoiceNo,
    clientId,
    jobId,
    issueDate,
    dueDate,
    currency,
    status,
    items,
    discount: totals.discount || undefined,
    tax: totals.tax || undefined,
    subtotal: totals.subtotal,
    total: totals.total,
    notes,
    paidAt,
  };

  const invoice = await updateInvoice(invoiceId, next);
  if (!invoice) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, invoice });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'trash')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { invoiceId } = await ctx.params;
  const invoice = await deleteInvoice(invoiceId);
  if (!invoice) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, invoice });
}

