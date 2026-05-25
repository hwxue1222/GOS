import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createInvoice, listInvoices } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { Currency, Invoice, InvoiceItem, InvoiceStatus } from '@/lib/types';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

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

function generateInvoiceNo() {
  const ymd = todayYmd().replace(/-/g, '');
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `INV-${ymd}-${rand}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const invoices = (await listInvoices()).filter((x) => !x.deletedAt);
  return NextResponse.json({ ok: true, invoices });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        invoiceNo?: string;
        clientId?: string;
        jobId?: string;
        issueDate?: string;
        dueDate?: string;
        currency?: Currency;
        status?: InvoiceStatus;
        items?: unknown;
        discount?: unknown;
        tax?: unknown;
        notes?: string;
      }
    | null;

  const clientId = body?.clientId?.trim() ?? '';
  if (!clientId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const invoiceNo = body?.invoiceNo?.trim() ? body!.invoiceNo!.trim() : generateInvoiceNo();
  const issueDate = body?.issueDate?.trim() || todayYmd();
  const dueDate = body?.dueDate?.trim() || undefined;
  const jobId = body?.jobId?.trim() || undefined;
  const currency: Currency = body?.currency ?? 'SGD';
  const status: InvoiceStatus = body?.status ?? 'UNPAID';
  const items = normalizeItems(body?.items);
  const discount = safeNumber(body?.discount);
  const tax = safeNumber(body?.tax);
  const notes = body?.notes?.trim() || undefined;

  const totals = computeTotals(items, discount, tax);
  const now = new Date().toISOString();

  const payload: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> = {
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
    paidAt: status === 'PAID' ? now : undefined,
    createdByUserId: user.id,
    deletedAt: undefined,
  };

  const invoice = await createInvoice(payload);
  return NextResponse.json({ ok: true, invoice });
}

