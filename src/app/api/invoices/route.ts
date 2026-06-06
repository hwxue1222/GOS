import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, createInvoice, findClientById, listInvoices, updateInvoice, upsertInvoiceEmailHistory } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { newPublicToken } from '@/lib/id';
import { hasPermission } from '@/lib/permissions';
import type { Currency, Invoice, InvoiceItem, InvoiceIssuer, InvoiceStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
}

const DEFAULT_INVOICE_EMAIL_SUBJECT = 'Invoice 发票 {{invoiceNo}}';

const DEFAULT_INVOICE_EMAIL_HTML =
  '<div style="font-family: ui-sans-serif, system-ui; line-height: 1.7; color: #111;">' +
    '<div style="font-size:14px;">{{billToCompany}}</div>' +
    '<div style="margin-top:10px;">欢迎您使用百桥咨询 BBY.SG 的财务/税务/公司秘书等专业服务，请查收发票，并尽快安排付款。</div>' +
    '<div style="margin-top:10px;">如有问题，请联系百桥咨询客服（微信 18851644566 或者 电话 +65 89926681）。</div>' +
    '<div style="margin-top:12px;">发票号 Invoice No: <b>{{invoiceNo}}</b></div>' +
    '<div style="margin-top:10px;">预览 / 打印 Preview / Print: <a href="{{printUrl}}">{{printUrl}}</a></div>' +
    '<hr style="border:0;border-top:1px solid #e5e5e5;margin:18px 0;" />' +
    '<div style="font-size:14px;">{{billToCompany}}</div>' +
    '<div style="margin-top:10px;">Thank you for choosing BBY.SG for professional accounting, tax, and corporate secretarial services. Please find the invoice attached and kindly arrange payment at your earliest convenience.</div>' +
    '<div style="margin-top:10px;">If you have any questions, please contact our customer service (WeChat: 18851644566 or Tel: +65 89926681).</div>' +
    '<div style="margin-top:12px;">Invoice No: <b>{{invoiceNo}}</b></div>' +
    '<div style="margin-top:10px;">Preview / Print: <a href="{{printUrl}}">{{printUrl}}</a></div>' +
  '</div>';

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
        issuer?: InvoiceIssuer;
        invoiceNo?: string;
        billTo?: unknown;
        jobId?: string;
        issueDate?: string;
        dueDate?: string;
        creditTerm?: string;
        doNo?: string;
        paymentMethod?: string;
        currency?: Currency;
        status?: InvoiceStatus;
        items?: unknown;
        discount?: unknown;
        tax?: unknown;
        notes?: string;
        fxUsdRate?: unknown;
        fxCnyRate?: unknown;
        recipients?: { to?: unknown; cc?: unknown };
        sendNow?: boolean;
        emailSubject?: unknown;
        emailHtml?: unknown;
      }
    | null;

  const issuer: InvoiceIssuer = body?.issuer ?? 'BBY_SG';
  const issueDate = body?.issueDate?.trim() || todayYmd();
  const dueDate = body?.dueDate?.trim() || undefined;
  const jobId = body?.jobId?.trim() || undefined;
  const creditTerm = body?.creditTerm?.trim() || undefined;
  const doNo = body?.doNo?.trim() || undefined;
  const paymentMethod = body?.paymentMethod?.trim() || undefined;

  const currency: Currency = body?.currency ?? 'SGD';
  const status: InvoiceStatus = body?.status ?? 'UNPAID';
  const items = normalizeItems(body?.items);
  const discount = safeNumber(body?.discount);
  const tax = safeNumber(body?.tax);
  const notes = body?.notes?.trim() || undefined;
  const fxUsdRate = currency === 'SGD' ? safeNumber(body?.fxUsdRate) || undefined : undefined;
  const fxCnyRate = currency === 'SGD' ? safeNumber(body?.fxCnyRate) || undefined : undefined;
  const toEmails = normalizeEmailList(body?.recipients?.to);
  const ccEmails = normalizeEmailList(body?.recipients?.cc);
  const sendNow = body?.sendNow ?? false;

  const totals = computeTotals(items, discount, tax);
  const now = new Date().toISOString();

  const billToRaw = body?.billTo as
    | { type?: 'CLIENT'; clientId?: string; companyName?: string; address?: string; contactNo?: string; email?: string }
    | { type?: 'ONE_OFF'; companyName?: string; address?: string; contactNo?: string; email?: string }
    | null
    | undefined;
  if (!billToRaw?.type) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  let billTo: Invoice['billTo'];
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

  const invoiceNo = body?.invoiceNo?.trim() ? body!.invoiceNo!.trim() : '';

  const payload: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> = {
    issuer,
    invoiceNo,
    publicToken: newPublicToken(),
    billTo,
    jobId,
    issueDate,
    dueDate,
    creditTerm,
    doNo,
    paymentMethod,
    currency,
    fxUsdRate,
    fxCnyRate,
    recipients: toEmails.length || ccEmails.length ? { to: toEmails, cc: ccEmails } : undefined,
    status,
    items,
    discount: totals.discount || undefined,
    tax: totals.tax || undefined,
    subtotal: totals.subtotal,
    total: totals.total,
    notes,
    paidAt: status === 'PAID' ? now : undefined,
    createdByUserId: user.id,
    sentAt: undefined,
    deletedAt: undefined,
  } as Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>;

  const invoice = await createInvoice(payload);

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'invoices',
    action: 'create',
    entityType: 'invoice',
    entityId: invoice.id,
    summary: `Create invoice: ${invoice.invoiceNo || invoice.id}`,
  });

  if (!sendNow) return NextResponse.json({ ok: true, invoice });
  if (!toEmails.length) {
    return NextResponse.json({ ok: true, invoice, send: { ok: false, error: 'MISSING_TO' as const } });
  }

  const baseUrl = process.env.APP_BASE_URL?.trim() || new URL(req.url).origin;
  const printUrl = `${baseUrl}/p/invoice/${invoice.publicToken}`;
  const subjectTemplate =
    typeof body?.emailSubject === 'string' && body.emailSubject.trim()
      ? body.emailSubject.trim()
      : process.env.INVOICE_EMAIL_SUBJECT?.trim() || DEFAULT_INVOICE_EMAIL_SUBJECT;
  const htmlTemplate =
    typeof body?.emailHtml === 'string' && body.emailHtml.trim()
      ? body.emailHtml
      : process.env.INVOICE_EMAIL_HTML?.trim() || DEFAULT_INVOICE_EMAIL_HTML;

  const vars = { invoiceNo: invoice.invoiceNo, billToCompany: invoice.billTo.companyName || '', printUrl };
  const subject = fillTemplate(subjectTemplate, vars);
  const html = fillTemplate(htmlTemplate, vars);

  const sendRes = await sendEmail({
    to: toEmails,
    cc: ccEmails.length ? ccEmails : undefined,
    subject,
    html,
  });

  if (!sendRes.ok) return NextResponse.json({ ok: true, invoice, send: { ok: false, error: sendRes.error } });

  const sentAt = new Date().toISOString();
  const updated = await updateInvoice(invoice.id, { ...invoice, sentAt, recipients: { to: toEmails, cc: ccEmails } });
  await upsertInvoiceEmailHistory({ billTo: invoice.billTo, toEmails, ccEmails });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'invoices',
    action: 'send',
    entityType: 'invoice',
    entityId: invoice.id,
    summary: `Send invoice: ${invoice.invoiceNo || invoice.id}`,
  });

  return NextResponse.json({ ok: true, invoice: updated, send: { ok: true } });
}
