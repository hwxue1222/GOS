'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';
import { DateInputDMY } from '@/components/DateInputDMY';
import type { Currency, Invoice, InvoiceIssuer, InvoiceItem, InvoiceStatus } from '@/lib/types';

type ClientLite = { id: string; code: string; name: string };
type JobLite = { id: string; name: string };
type UserLite = { id: string; name: string; email: string; role: 'owner' | 'manager' | 'staff' };

type Props = {
  initialMe: UserLite;
  initialInvoice: Invoice;
  initialClients: ClientLite[];
  createdByName: string;
  initialJob: JobLite | null;
};

function safeNumber(v: unknown) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeSubtotal(items: InvoiceItem[]) {
  return round2(items.reduce((sum, it) => sum + safeNumber(it.qty) * safeNumber(it.unitPrice), 0));
}

function formatMoney(currency: Currency, amount: number) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function statusLabel(status: InvoiceStatus) {
  if (status === 'PAID') return { text: 'Paid', cls: 'bg-green-100 text-green-700' };
  if (status === 'VOID') return { text: 'Void', cls: 'bg-black/10 text-black/70' };
  return { text: 'Unpaid', cls: 'bg-amber-100 text-amber-700' };
}

function newTempId() {
  return globalThis.crypto?.randomUUID?.() ?? `tmp_${Math.random().toString(16).slice(2)}`;
}

function splitEmails(text: string) {
  const parts = text
    .split(/[\s,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export default function InvoiceDetailClient({
  initialMe,
  initialInvoice,
  initialClients,
  createdByName,
  initialJob,
}: Props) {
  const [me] = useState<UserLite>(initialMe);
  const [clients] = useState<ClientLite[]>(initialClients);
  const [job] = useState<JobLite | null>(initialJob);

  const [invoice, setInvoice] = useState<Invoice>(initialInvoice);

  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidDate, setMarkPaidDate] = useState('');
  const [markPaidNote, setMarkPaidNote] = useState('');
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  const downloadPdf = async () => {
    if (downloadingPdf) return;
    setError(null);
    setSuccess(null);
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`, { method: 'GET' });
      if (!res.ok) {
        setError('DOWNLOAD_PDF_FAILED');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filenameBase = (invoice.invoiceNo || invoice.id).replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
      a.download = `${filenameBase}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('DOWNLOAD_PDF_FAILED');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const [draft, setDraft] = useState({
    issuer: initialInvoice.issuer,
    invoiceNo: initialInvoice.invoiceNo,
    billToType: initialInvoice.billTo.type as 'CLIENT' | 'ONE_OFF',
    clientId: initialInvoice.billTo.type === 'CLIENT' ? initialInvoice.billTo.clientId : '',
    companyName: initialInvoice.billTo.companyName || '',
    address: initialInvoice.billTo.address ?? '',
    contactNo: initialInvoice.billTo.contactNo ?? '',
    email: initialInvoice.billTo.email ?? '',
    issueDate: initialInvoice.issueDate,
    dueDate: initialInvoice.dueDate ?? '',
    creditTerm: initialInvoice.creditTerm ?? 'Net 15',
    doNo: initialInvoice.doNo ?? '',
    paymentMethod: initialInvoice.paymentMethod ?? 'As below',
    currency: initialInvoice.currency,
    fxUsdRate: initialInvoice.fxUsdRate ? String(initialInvoice.fxUsdRate) : '',
    fxCnyRate: initialInvoice.fxCnyRate ? String(initialInvoice.fxCnyRate) : '',
    status: initialInvoice.status,
    discount: initialInvoice.discount ? String(initialInvoice.discount) : '',
    tax: initialInvoice.tax ? String(initialInvoice.tax) : '',
    notes: initialInvoice.notes ?? '',
    toEmailsText: (initialInvoice.recipients?.to ?? []).join(' '),
  });

  const [suggestions, setSuggestions] = useState<{
    history: { toEmails: string[]; ccEmails: string[] };
    notifyPeople: Array<{ role: 'DIRECTOR' | 'SHAREHOLDER'; name: string; email: string }>;
  } | null>(null);

  const [items, setItems] = useState<InvoiceItem[]>(
    initialInvoice.items.length ? initialInvoice.items : [{ id: newTempId(), description: '', qty: 1, unitPrice: 0 }],
  );

  const subtotal = computeSubtotal(items);
  const discount = round2(Math.max(0, safeNumber(draft.discount)));
  const tax = round2(Math.max(0, safeNumber(draft.tax)));
  const totalAmount = round2(Math.max(0, subtotal - discount + tax));

  const canEdit = me.role === 'owner' || me.role === 'manager';
  const canDelete = me.role === 'owner';

  const statusPill = statusLabel(invoice.status);

  const currentClient = useMemo(() => {
    if (draft.billToType !== 'CLIENT') return null;
    return clients.find((c) => c.id === draft.clientId) ?? null;
  }, [clients, draft.billToType, draft.clientId]);

  useEffect(() => {
    let canceled = false;
    async function run() {
      if (!canEdit) return;
      if (draft.billToType === 'CLIENT') {
        const clientId = draft.clientId.trim();
        if (!clientId) {
          setSuggestions(null);
          return;
        }
        const sugRes = await fetch(`/api/invoices/suggestions?type=CLIENT&clientId=${encodeURIComponent(clientId)}`).catch(() => null);
        if (canceled) return;
        if (!sugRes?.ok) {
          setSuggestions(null);
          return;
        }
        const s = (await sugRes.json().catch(() => null)) as
          | {
              ok?: boolean;
              history?: { toEmails?: string[]; ccEmails?: string[] };
              notifyPeople?: Array<{ role: 'DIRECTOR' | 'SHAREHOLDER'; name: string; email: string }>;
            }
          | null;
        if (!s?.ok) {
          setSuggestions(null);
          return;
        }
        setSuggestions({
          history: { toEmails: s.history?.toEmails ?? [], ccEmails: s.history?.ccEmails ?? [] },
          notifyPeople: s.notifyPeople ?? [],
        });
        return;
      }
      const companyName = draft.companyName.trim();
      if (!companyName) {
        setSuggestions(null);
        return;
      }
      const sugRes = await fetch(`/api/invoices/suggestions?type=ONE_OFF&companyName=${encodeURIComponent(companyName)}`).catch(() => null);
      if (canceled) return;
      if (!sugRes?.ok) {
        setSuggestions(null);
        return;
      }
      const s = (await sugRes.json().catch(() => null)) as
        | {
            ok?: boolean;
            history?: { toEmails?: string[]; ccEmails?: string[] };
          }
        | null;
      if (!s?.ok) {
        setSuggestions(null);
        return;
      }
      setSuggestions({
        history: { toEmails: s.history?.toEmails ?? [], ccEmails: s.history?.ccEmails ?? [] },
        notifyPeople: [],
      });
    }
    void run();
    return () => {
      canceled = true;
    };
  }, [canEdit, draft.billToType, draft.clientId, draft.companyName]);

  async function saveInvoice(patch?: Partial<{ status: InvoiceStatus; paidAt: string | null; paymentNote: string | null }>) {
    setError(null);
    setSuccess(null);
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    if (!canEdit) return;

    const normalizedItems = items
      .map((it) => ({
        ...it,
        description: it.description.trim(),
        qty: round2(Math.max(0, safeNumber(it.qty))),
        unitPrice: round2(Math.max(0, safeNumber(it.unitPrice))),
      }))
      .filter((it) => it.description);
    if (!normalizedItems.length) {
      setError('INVALID_ITEMS');
      return;
    }

    setSaving(true);
    try {
      const status = patch?.status ?? draft.status;
      const toEmails = splitEmails(draft.toEmailsText);
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: draft.issuer,
          invoiceNo: draft.invoiceNo || undefined,
          billTo:
            draft.billToType === 'CLIENT'
              ? {
                  type: 'CLIENT',
                  clientId: draft.clientId,
                  companyName: draft.companyName || undefined,
                  address: draft.address || undefined,
                  contactNo: draft.contactNo || undefined,
                  email: draft.email || undefined,
                }
              : {
                  type: 'ONE_OFF',
                  companyName: draft.companyName,
                  address: draft.address || undefined,
                  contactNo: draft.contactNo || undefined,
                  email: draft.email || undefined,
                },
          issueDate: draft.issueDate,
          dueDate: draft.dueDate || null,
          creditTerm: draft.creditTerm || null,
          doNo: draft.doNo || null,
          paymentMethod: draft.paymentMethod || null,
          currency: draft.currency,
          status,
          paidAt: patch && 'paidAt' in patch ? patch.paidAt : undefined,
          paymentNote: patch && 'paymentNote' in patch ? patch.paymentNote : undefined,
          fxUsdRate: draft.fxUsdRate ? safeNumber(draft.fxUsdRate) : undefined,
          fxCnyRate: draft.fxCnyRate ? safeNumber(draft.fxCnyRate) : undefined,
          recipients: { to: toEmails },
          discount: draft.discount ? safeNumber(draft.discount) : undefined,
          tax: draft.tax ? safeNumber(draft.tax) : undefined,
          notes: draft.notes || null,
          items: normalizedItems,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'UPDATE_FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; invoice?: Invoice } | null;
      if (!j?.invoice) return;
      setInvoice(j.invoice);
      setDraft((p) => ({
        ...p,
        issuer: j.invoice!.issuer,
        invoiceNo: j.invoice!.invoiceNo,
        billToType: j.invoice!.billTo.type,
        clientId: j.invoice!.billTo.type === 'CLIENT' ? j.invoice!.billTo.clientId : '',
        companyName: j.invoice!.billTo.companyName || '',
        address: j.invoice!.billTo.address ?? '',
        contactNo: j.invoice!.billTo.contactNo ?? '',
        email: j.invoice!.billTo.email ?? '',
        currency: j.invoice!.currency,
        status: j.invoice!.status,
        creditTerm: j.invoice!.creditTerm ?? 'Net 15',
        doNo: j.invoice!.doNo ?? '',
        paymentMethod: j.invoice!.paymentMethod ?? 'As below',
        fxUsdRate: j.invoice!.fxUsdRate ? String(j.invoice!.fxUsdRate) : '',
        fxCnyRate: j.invoice!.fxCnyRate ? String(j.invoice!.fxCnyRate) : '',
      }));
      setSuccess('Updated successfully');
      successTimerRef.current = window.setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function markPaidConfirm() {
    setMarkPaidError(null);
    const ymd = markPaidDate.trim();
    if (!ymd) {
      setMarkPaidError('Paid date is required');
      return;
    }
    const note = markPaidNote.trim();
    if (!note) {
      setMarkPaidError('Payment note is required');
      return;
    }
    await saveInvoice({ status: 'PAID', paidAt: ymd, paymentNote: note });
    setMarkPaidOpen(false);
    setMarkPaidDate('');
    setMarkPaidNote('');
  }

  async function deleteThis() {
    if (!canDelete) return;
    const ok = window.confirm('Delete this invoice?');
    if (!ok) return;
    const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return;
    window.location.href = '/invoices';
  }

  async function sendEmailNow() {
    if (!canEdit) return;
    setError(null);
    const to = splitEmails(draft.toEmailsText);
    if (!to.length) {
      setError('MISSING_TO');
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? 'EMAIL_SEND_FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; invoice?: Invoice } | null;
      if (!j?.invoice) return;
      setInvoice(j.invoice);
      setDraft((p) => ({
        ...p,
        toEmailsText: (j.invoice!.recipients?.to ?? []).join(' '),
      }));
      setSuccess('Email sent');
      successTimerRef.current = window.setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="flex-1">
      {markPaidOpen ? (
        <div
          className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4"
          onMouseDown={() => setMarkPaidOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-lg border border-black/10 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
              <div className="text-base font-semibold">Mark Paid</div>
              <button onClick={() => setMarkPaidOpen(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>
            <div className="p-4">
              {markPaidError ? <div className="mb-3 text-sm text-red-600">{markPaidError}</div> : null}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs text-black/60 mb-1">Paid Date</div>
                  <DateInputDMY
                    value={markPaidDate}
                    onChange={(v) => setMarkPaidDate(v)}
                    inputClassName="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <div className="text-xs text-black/60 mb-1">Payment Note</div>
                  <textarea
                    value={markPaidNote}
                    onChange={(e) => setMarkPaidNote(e.target.value)}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    rows={3}
                    placeholder="e.g. PayNow / bank transfer reference..."
                  />
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-black/5 flex items-center justify-end gap-2">
              <button onClick={() => setMarkPaidOpen(false)} className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                disabled={saving || !canEdit}
                onClick={() => void markPaidConfirm()}
                className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link className="text-sm text-[#2f7bdc] hover:underline" href="/invoices">
                ← Invoices
              </Link>
            </div>
            <h1 className="mt-2 text-xl font-semibold truncate">{invoice.invoiceNo}</h1>
            <div className="mt-1 text-sm text-black/60 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <span className={['inline-flex px-2 py-1 rounded-full text-xs font-semibold', statusPill.cls].join(' ')}>
                  {statusPill.text}
                </span>
                <span className="text-black/40">·</span>
                <span>{formatMoney(invoice.currency, invoice.total)}</span>
              </div>
              <div className="text-black/40">·</div>
              <div>
                <span className="text-black/50">Issue </span>
                <span>{formatDateDMY(invoice.issueDate)}</span>
              </div>
              {invoice.dueDate ? (
                <>
                  <div className="text-black/40">·</div>
                  <div>
                    <span className="text-black/50">Due </span>
                    <span>{formatDateDMY(invoice.dueDate)}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium"
              href={`/invoices/${invoice.id}/print`}
              target="_blank"
            >
              Preview / Print
            </Link>
            <button
              type="button"
              disabled={saving || sendingEmail || downloadingPdf}
              onClick={() => void downloadPdf()}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {downloadingPdf ? 'Preparing PDF...' : 'Download PDF'}
            </button>
            <button
              disabled={saving || sendingEmail || !canEdit}
              onClick={() => void sendEmailNow()}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {sendingEmail ? 'Sending...' : 'Send Email'}
            </button>
            {invoice.status !== 'PAID' ? (
              <button
                disabled={saving || !canEdit}
                onClick={() => {
                  setMarkPaidError(null);
                  setMarkPaidDate('');
                  setMarkPaidNote('');
                  setMarkPaidOpen(true);
                }}
                className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Mark Paid
              </button>
            ) : (
              <button
                disabled={saving || !canEdit}
                onClick={() => void saveInvoice({ status: 'UNPAID', paidAt: null, paymentNote: null })}
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Mark Unpaid
              </button>
            )}
            {invoice.status !== 'VOID' ? (
              <button
                disabled={saving || !canEdit}
                onClick={() => void saveInvoice({ status: 'VOID' })}
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Void
              </button>
            ) : null}
            {canDelete ? (
              <button
                disabled={saving}
                onClick={() => void deleteThis()}
                className="rounded-md border border-red-200 bg-white text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl bg-white border border-black/5 p-4 sm:p-6">
            {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
            {success ? <div className="mb-3 text-sm text-green-700">{success}</div> : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-black/60 mb-1">Bill To Type</div>
                <select
                  disabled={!canEdit}
                  value={draft.billToType}
                  onChange={(e) => {
                    const v = e.target.value as 'CLIENT' | 'ONE_OFF';
                    setDraft((p) => ({ ...p, billToType: v, clientId: v === 'CLIENT' ? p.clientId : '' }));
                  }}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                >
                  <option value="CLIENT">Existing client</option>
                  <option value="ONE_OFF">One-off company</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Issuer Company</div>
                <select
                  disabled={!canEdit}
                  value={draft.issuer}
                  onChange={(e) => setDraft((p) => ({ ...p, issuer: e.target.value as InvoiceIssuer }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                >
                  <option value="BBY_SG">BBY.SG Pte. Ltd.</option>
                  <option value="BYBRIDGE">Bybridge Consultancy Pte. Ltd.</option>
                </select>
              </div>

              {draft.billToType === 'CLIENT' ? (
                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">Company</div>
                  <select
                    disabled={!canEdit}
                    value={draft.clientId}
                    onChange={(e) => setDraft((p) => ({ ...p, clientId: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                  >
                    <option value="">Select client...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">Company Name</div>
                  <input
                    disabled={!canEdit}
                    value={draft.companyName}
                    onChange={(e) => setDraft((p) => ({ ...p, companyName: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                  />
                </div>
              )}

              <div>
                <div className="text-xs text-black/60 mb-1">Invoice No</div>
                <input
                  disabled={!canEdit}
                  value={draft.invoiceNo}
                  onChange={(e) => setDraft((p) => ({ ...p, invoiceNo: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Currency</div>
                <select
                  disabled={!canEdit}
                  value={draft.currency}
                  onChange={(e) => {
                    const next = e.target.value as Currency;
                    setDraft((p) => ({
                      ...p,
                      currency: next,
                      fxUsdRate: next === 'SGD' ? p.fxUsdRate : '',
                      fxCnyRate: next === 'SGD' ? p.fxCnyRate : '',
                    }));
                  }}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                >
                  {(['MYR', 'SGD', 'USD', 'CNY'] as Currency[]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Issue Date</div>
                <DateInputDMY
                  value={draft.issueDate}
                  onChange={(v) => setDraft((p) => ({ ...p, issueDate: v }))}
                  disabled={!canEdit}
                  inputClassName="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Due Date</div>
                <DateInputDMY
                  value={draft.dueDate}
                  onChange={(v) => setDraft((p) => ({ ...p, dueDate: v }))}
                  disabled={!canEdit}
                  inputClassName="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Credit Term</div>
                <input
                  disabled={!canEdit}
                  value={draft.creditTerm}
                  onChange={(e) => setDraft((p) => ({ ...p, creditTerm: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">D/O No.</div>
                <input
                  disabled={!canEdit}
                  value={draft.doNo}
                  onChange={(e) => setDraft((p) => ({ ...p, doNo: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="text-xs text-black/60 mb-1">Payment Method</div>
                <input
                  disabled={!canEdit}
                  value={draft.paymentMethod}
                  onChange={(e) => setDraft((p) => ({ ...p, paymentMethod: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                />
              </div>

              {draft.billToType === 'CLIENT' ? (
                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">Company Name (override)</div>
                  <input
                    disabled={!canEdit}
                    value={draft.companyName}
                    onChange={(e) => setDraft((p) => ({ ...p, companyName: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                    placeholder={currentClient?.name ?? ''}
                  />
                </div>
              ) : null}

              <div className="sm:col-span-2">
                <div className="text-xs text-black/60 mb-1">Address</div>
                <textarea
                  disabled={!canEdit}
                  value={draft.address}
                  onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                  rows={2}
                />
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Contact No.</div>
                <input
                  disabled={!canEdit}
                  value={draft.contactNo}
                  onChange={(e) => setDraft((p) => ({ ...p, contactNo: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs text-black/60 mb-1">Email</div>
                <input
                  disabled={!canEdit}
                  value={draft.email}
                  onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                  inputMode="email"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="text-xs text-black/60 mb-1">To Emails</div>
                <input
                  disabled={!canEdit}
                  value={draft.toEmailsText}
                  onChange={(e) => setDraft((p) => ({ ...p, toEmailsText: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                />
                {canEdit && suggestions?.notifyPeople?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestions.notifyPeople.map((p) => (
                      <button
                        key={`${p.role}:${p.email}`}
                        type="button"
                        onClick={() => {
                          const email = p.email.trim();
                          if (!email) return;
                          setDraft((prev) => {
                            const has = prev.toEmailsText.toLowerCase().includes(email.toLowerCase());
                            return has ? prev : { ...prev, toEmailsText: `${prev.toEmailsText} ${email}`.trim() };
                          });
                        }}
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/70 hover:bg-black/[0.02]"
                        title={`${p.role}: ${p.name}`}
                      >
                        {p.name} ({p.role})
                      </button>
                    ))}
                  </div>
                ) : null}
                {canEdit && suggestions?.history?.toEmails?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestions.history.toEmails.map((e) => (
                      <button
                        key={`to:${e}`}
                        type="button"
                        onClick={() => {
                          const email = e.trim();
                          if (!email) return;
                          setDraft((prev) => {
                            const has = prev.toEmailsText.toLowerCase().includes(email.toLowerCase());
                            return has ? prev : { ...prev, toEmailsText: `${prev.toEmailsText} ${email}`.trim() };
                          });
                        }}
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/70 hover:bg-black/[0.02]"
                        title="History"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {draft.currency === 'SGD' ? (
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div>
                    <div className="text-xs text-black/60 mb-1">USD/SGD rate</div>
                    <input
                      disabled={!canEdit}
                      value={draft.fxUsdRate}
                      onChange={(e) => setDraft((p) => ({ ...p, fxUsdRate: e.target.value }))}
                      className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                      inputMode="decimal"
                      placeholder="e.g. 0.70"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-black/60 mb-1">SGD/CNY rate (1 SGD → CNY)</div>
                    <input
                      disabled={!canEdit}
                      value={draft.fxCnyRate}
                      onChange={(e) => setDraft((p) => ({ ...p, fxCnyRate: e.target.value }))}
                      className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                      inputMode="decimal"
                      placeholder="e.g. 5.35"
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <div>
                  <div className="text-xs text-black/60 mb-1">Discount</div>
                  <input
                    disabled={!canEdit}
                    value={draft.discount}
                    onChange={(e) => setDraft((p) => ({ ...p, discount: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div className="text-xs text-black/60 mb-1">Tax</div>
                  <input
                    disabled={!canEdit}
                    value={draft.tax}
                    onChange={(e) => setDraft((p) => ({ ...p, tax: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="text-xs text-black/60 mb-1">Notes</div>
                <textarea
                  disabled={!canEdit}
                  value={draft.notes}
                  onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white disabled:opacity-60"
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Items</div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setItems((prev) => [...prev, { id: newTempId(), description: '', qty: 1, unitPrice: 0 }])}
                    className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm"
                  >
                    + Add item
                  </button>
                ) : null}
              </div>

              <div className="mt-2 rounded-xl border border-black/10 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-black/60 bg-black/[0.02]">
                    <tr className="border-b border-black/5">
                      <th className="px-3 py-2 font-medium min-w-[240px]">Description</th>
                      <th className="px-3 py-2 font-medium w-[110px]">Qty</th>
                      <th className="px-3 py-2 font-medium w-[140px]">Unit price</th>
                      <th className="px-3 py-2 font-medium w-[140px]">Amount</th>
                      <th className="px-3 py-2 font-medium w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const amount = round2(safeNumber(it.qty) * safeNumber(it.unitPrice));
                      return (
                        <tr key={it.id} className="border-b border-black/5">
                          <td className="px-3 py-2">
                            <input
                              disabled={!canEdit}
                              value={it.description}
                              onChange={(e) => {
                                const v = e.target.value;
                                setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, description: v } : x)));
                              }}
                              className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none disabled:opacity-60"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              disabled={!canEdit}
                              value={String(it.qty)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setItems((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, qty: safeNumber(v) } : x)),
                                );
                              }}
                              className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none disabled:opacity-60"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              disabled={!canEdit}
                              value={String(it.unitPrice)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setItems((prev) =>
                                  prev.map((x) => (x.id === it.id ? { ...x, unitPrice: safeNumber(v) } : x)),
                                );
                              }}
                              className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none disabled:opacity-60"
                              inputMode="decimal"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatMoney(draft.currency, amount)}</td>
                          <td className="px-3 py-2 text-right">
                            {canEdit ? (
                              <button
                                type="button"
                                disabled={items.length <= 1}
                                onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                                className="rounded-md border border-red-200 bg-white text-red-600 px-2 py-1 text-xs hover:bg-red-50 disabled:opacity-40"
                              >
                                Delete
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <div className="text-black/60">Subtotal</div>
                  <div className="min-w-[140px] text-right">{formatMoney(draft.currency, subtotal)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-black/60">Discount</div>
                  <div className="min-w-[140px] text-right">{formatMoney(draft.currency, discount)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-black/60">Tax</div>
                  <div className="min-w-[140px] text-right">{formatMoney(draft.currency, tax)}</div>
                </div>
                <div className="flex items-center gap-2 font-semibold">
                  <div>Total</div>
                  <div className="min-w-[140px] text-right">{formatMoney(draft.currency, totalAmount)}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                disabled={saving || !canEdit}
                onClick={() => void saveInvoice()}
                className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-black/5 p-4 sm:p-6">
            <div className="text-sm font-semibold">Info</div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-black/60">Issuer</div>
                <div className="text-right">{invoice.issuer}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-black/60">Bill To</div>
                <div className="text-right">
                  {currentClient ? (
                    <Link className="text-[#2f7bdc] hover:underline" href={`/clients/${currentClient.id}`}>
                      {currentClient.code} {currentClient.name}
                    </Link>
                  ) : (
                    invoice.billTo.companyName || '-'
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-black/60">Job</div>
                <div className="text-right">
                  {job ? (
                    <Link className="text-[#2f7bdc] hover:underline" href={`/jobs/${job.id}`}>
                      {job.name}
                    </Link>
                  ) : (
                    '-'
                  )}
                </div>
              </div>
              {invoice.sentAt ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-black/60">Sent at</div>
                  <div className="text-right">{formatDateDMY(invoice.sentAt)}</div>
                </div>
              ) : null}
              {invoice.recipients?.to?.length ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-black/60">To</div>
                  <div className="text-right max-w-[220px] truncate" title={invoice.recipients.to.join(', ')}>
                    {invoice.recipients.to.join(', ')}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="text-black/60">Created by</div>
                <div className="text-right">{createdByName}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-black/60">Created</div>
                <div className="text-right">{formatDateDMY(invoice.createdAt)}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-black/60">Updated</div>
                <div className="text-right">{formatDateDMY(invoice.updatedAt)}</div>
              </div>
              {invoice.paidAt ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-black/60">Paid at</div>
                  <div className="text-right">{formatDateDMY(invoice.paidAt)}</div>
                </div>
              ) : null}
              {invoice.paymentNote ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-black/60">Payment note</div>
                  <div className="text-right max-w-[220px] truncate" title={invoice.paymentNote}>
                    {invoice.paymentNote}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
