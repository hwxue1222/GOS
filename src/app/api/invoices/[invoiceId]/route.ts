import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteInvoice, findClientById, findInvoiceById, updateInvoice } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { Currency, Invoice, InvoiceItem, InvoiceIssuer, InvoiceStatus } from '@/lib/types';

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

function normalizeEmailList(input: unknown) {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
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
        issuer?: InvoiceIssuer;
        invoiceNo?: string;
        billTo?: unknown;
        jobId?: string | null;
        issueDate?: string;
        dueDate?: string | null;
        creditTerm?: string | null;
        doNo?: string | null;
        paymentMethod?: string | null;
        currency?: Currency;
        status?: InvoiceStatus;
        items?: unknown;
        discount?: unknown;
        tax?: unknown;
        notes?: string | null;
        paidAt?: string | null;
        fxUsdRate?: unknown;
        fxCnyRate?: unknown;
        recipients?: { to?: unknown; cc?: unknown } | null;
        sentAt?: string | null;
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

  const issuer: InvoiceIssuer = body?.issuer ?? current.issuer;
  const invoiceNo = body?.invoiceNo?.trim() ? body!.invoiceNo!.trim() : current.invoiceNo;
  const issueDate = body?.issueDate?.trim() ? body!.issueDate!.trim() : current.issueDate;
  const dueDate =
    body && 'dueDate' in body ? (body.dueDate ? String(body.dueDate).trim() || undefined : undefined) : current.dueDate;
  const jobId =
    body && 'jobId' in body ? (body.jobId ? String(body.jobId).trim() || undefined : undefined) : current.jobId;
  const creditTerm =
    body && 'creditTerm' in body ? (body.creditTerm ? String(body.creditTerm).trim() || undefined : undefined) : current.creditTerm;
  const doNo = body && 'doNo' in body ? (body.doNo ? String(body.doNo).trim() || undefined : undefined) : current.doNo;
  const paymentMethod =
    body && 'paymentMethod' in body ? (body.paymentMethod ? String(body.paymentMethod).trim() || undefined : undefined) : current.paymentMethod;
  const currency: Currency = body?.currency ?? current.currency;
  const status: InvoiceStatus = body?.status ?? current.status;
  const items = body && 'items' in body ? normalizeItems(body.items) : current.items;
  const discount = body && 'discount' in body ? safeNumber(body.discount) : current.discount ?? 0;
  const tax = body && 'tax' in body ? safeNumber(body.tax) : current.tax ?? 0;
  const notes = body && 'notes' in body ? (body.notes ? String(body.notes).trim() || undefined : undefined) : current.notes;
  const fxUsdRate = body && 'fxUsdRate' in body ? (safeNumber(body.fxUsdRate) || undefined) : current.fxUsdRate;
  const fxCnyRate = body && 'fxCnyRate' in body ? (safeNumber(body.fxCnyRate) || undefined) : current.fxCnyRate;
  const sentAt = body && 'sentAt' in body ? (body.sentAt ? String(body.sentAt).trim() || undefined : undefined) : current.sentAt;

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

  let billTo: Invoice['billTo'] = current.billTo;
  if (body && 'billTo' in body && body.billTo) {
    const billToRaw = body.billTo as
      | { type?: 'CLIENT'; clientId?: string; companyName?: string; address?: string; contactNo?: string; email?: string }
      | { type?: 'ONE_OFF'; companyName?: string; address?: string; contactNo?: string; email?: string }
      | null
      | undefined;
    if (!billToRaw?.type) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    if (billToRaw.type === 'CLIENT') {
      const clientId = billToRaw.clientId?.trim() ?? '';
      if (!clientId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
      const client = await findClientById(clientId);
      if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'INVALID_CLIENT' }, { status: 400 });
      billTo = {
        type: 'CLIENT',
        clientId,
        companyName: billToRaw.companyName?.trim() || client.name,
        address: billToRaw.address?.trim() || client.address || undefined,
        contactNo: billToRaw.contactNo?.trim() || client.phone || undefined,
        email: billToRaw.email?.trim() || client.email || undefined,
      };
    } else {
      const companyName = billToRaw.companyName?.trim() ?? '';
      if (!companyName) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
      billTo = {
        type: 'ONE_OFF',
        companyName,
        address: billToRaw.address?.trim() || undefined,
        contactNo: billToRaw.contactNo?.trim() || undefined,
        email: billToRaw.email?.trim() || undefined,
      };
    }
  }

  const recipients =
    body && 'recipients' in body
      ? body.recipients
        ? (() => {
            const to = normalizeEmailList(body.recipients?.to);
            const cc = normalizeEmailList(body.recipients?.cc);
            return to.length || cc.length ? { to, cc } : undefined;
          })()
        : undefined
      : current.recipients;

  const next: Omit<Invoice, 'updatedAt'> = {
    ...current,
    issuer,
    invoiceNo,
    billTo,
    jobId,
    issueDate,
    dueDate,
    creditTerm,
    doNo,
    paymentMethod,
    currency,
    status,
    fxUsdRate,
    fxCnyRate,
    recipients,
    sentAt,
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
