'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';
import { DateInputDMY } from '@/components/DateInputDMY';
import type { Currency, Invoice, InvoiceItem, InvoiceStatus } from '@/lib/types';

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  const [draft, setDraft] = useState({
    invoiceNo: initialInvoice.invoiceNo,
    clientId: initialInvoice.clientId,
    issueDate: initialInvoice.issueDate,
    dueDate: initialInvoice.dueDate ?? '',
    currency: initialInvoice.currency,
    status: initialInvoice.status,
    discount: initialInvoice.discount ? String(initialInvoice.discount) : '',
    tax: initialInvoice.tax ? String(initialInvoice.tax) : '',
    notes: initialInvoice.notes ?? '',
  });

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
    return clients.find((c) => c.id === draft.clientId) ?? null;
  }, [clients, draft.clientId]);

  async function saveInvoice(patch?: Partial<{ status: InvoiceStatus }>) {
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
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoiceNo: draft.invoiceNo || undefined,
          clientId: draft.clientId,
          issueDate: draft.issueDate,
          dueDate: draft.dueDate || null,
          currency: draft.currency,
          status,
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
      setDraft((p) => ({ ...p, status: j.invoice!.status }));
      setSuccess('Updated successfully');
      successTimerRef.current = window.setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function deleteThis() {
    if (!canDelete) return;
    const ok = window.confirm('Delete this invoice?');
    if (!ok) return;
    const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return;
    window.location.href = '/invoices';
  }

  return (
    <div className="flex-1">
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
            {invoice.status !== 'PAID' ? (
              <button
                disabled={saving || !canEdit}
                onClick={() => void saveInvoice({ status: 'PAID' })}
                className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Mark Paid
              </button>
            ) : (
              <button
                disabled={saving || !canEdit}
                onClick={() => void saveInvoice({ status: 'UNPAID' })}
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
                <div className="text-xs text-black/60 mb-1">Client</div>
                <select
                  disabled={!canEdit}
                  value={draft.clientId}
                  onChange={(e) => setDraft((p) => ({ ...p, clientId: e.target.value }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </select>
              </div>

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
                <div className="text-xs text-black/60 mb-1">Currency</div>
                <select
                  disabled={!canEdit}
                  value={draft.currency}
                  onChange={(e) => setDraft((p) => ({ ...p, currency: e.target.value as Currency }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                >
                  {(['MYR', 'SGD', 'USD', 'CNY'] as Currency[]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div className="text-black/60">Client</div>
                <div className="text-right">
                  {currentClient ? (
                    <Link className="text-[#2f7bdc] hover:underline" href={`/clients/${currentClient.id}`}>
                      {currentClient.code} {currentClient.name}
                    </Link>
                  ) : (
                    '-'
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
