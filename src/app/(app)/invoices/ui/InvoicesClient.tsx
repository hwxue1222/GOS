'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';
import { DateInputYMD } from '@/components/DateInputYMD';
import { usePersistedState } from '@/lib/usePersistedState';
import PaginationControls from '@/components/PaginationControls';
import type { Currency, Invoice, InvoiceIssuer, InvoiceItem, InvoiceStatus, Role } from '@/lib/types';

type ClientLite = { id: string; code: string; name: string };
type UserLite = { id: string; name: string; email: string; role: Role };

type InvoiceRow = {
  invoice: Invoice;
  client: ClientLite | null;
  createdByName: string;
};

type Props = {
  initialMe: UserLite;
  initialInvoices: InvoiceRow[];
  initialClients: ClientLite[];
};

function textMatch(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

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

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function newTempId() {
  return globalThis.crypto?.randomUUID?.() ?? `tmp_${Math.random().toString(16).slice(2)}`;
}

function toCsvValue(v: string) {
  if (v.includes('"') || v.includes(',') || v.includes('\n')) return `"${v.replaceAll('"', '""')}"`;
  return v;
}

export default function InvoicesClient({ initialMe, initialInvoices, initialClients }: Props) {
  const [me] = useState<UserLite>(initialMe);
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [clients] = useState<ClientLite[]>(initialClients);

  const [search, setSearch] = usePersistedState('gos.invoices.search', '');
  const [statusFilter, setStatusFilter] = usePersistedState<InvoiceStatus | ''>('gos.invoices.status', '');
  const [issuerFilter, setIssuerFilter] = usePersistedState<InvoiceIssuer | ''>('gos.invoices.issuer', '');
  const [pageSize, setPageSize] = usePersistedState('gos.invoices.pageSize', 20);
  const [page, setPage] = usePersistedState('gos.invoices.page', 1);

  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientSearch, setNewClientSearch] = useState('');
  const clientSearchRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    issuer: 'BBY_SG' as InvoiceIssuer,
    invoiceNo: '',
    billToType: 'CLIENT' as 'CLIENT' | 'ONE_OFF',
    clientId: '',
    companyName: '',
    address: '',
    contactNo: '',
    email: '',
    issueDate: todayYmd(),
    dueDate: '',
    creditTerm: 'Net 15',
    doNo: '',
    paymentMethod: 'As below',
    currency: 'SGD' as Currency,
    fxUsdRate: '',
    fxCnyRate: '',
    discount: '',
    tax: '',
    notes: '',
    toEmailsText: '',
  });

  const [suggestions, setSuggestions] = useState<{
    history: { toEmails: string[]; ccEmails: string[] };
    notifyPeople: Array<{ role: 'DIRECTOR' | 'SHAREHOLDER'; name: string; email: string }>;
  } | null>(null);

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: newTempId(), description: '', qty: 1, unitPrice: 0 },
  ]);

  const filtered = useMemo(() => {
    const q = search.trim();
    const rows = invoices.filter((row) => {
      const inv = row.invoice;
      if (statusFilter && inv.status !== statusFilter) return false;
      if (issuerFilter && inv.issuer !== issuerFilter) return false;
      if (!q) return true;
      const clientText = row.client ? `${row.client.code} ${row.client.name}` : '';
      const billToText = inv.billTo.companyName || '';
      const totalText = `${inv.total}`;
      const datesText = `${inv.issueDate} ${inv.paidAt ?? ''}`;
      return textMatch(
        `${inv.invoiceNo} ${inv.issuer} ${billToText} ${clientText} ${inv.currency} ${inv.status} ${totalText} ${datesText} ${row.createdByName}`,
        q,
      );
    });
    return rows.sort((a, b) => (b.invoice.issueDate || '').localeCompare(a.invoice.issueDate || '') || b.invoice.createdAt.localeCompare(a.invoice.createdAt));
  }, [invoices, issuerFilter, search, statusFilter]);

  const activeFilterCount = (statusFilter ? 1 : 0) + (issuerFilter ? 1 : 0);

  const total = filtered.length;
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const pageStart = (safePage - 1) * safePageSize;
  const pageEnd = Math.min(total, pageStart + safePageSize);
  const visible = filtered.slice(pageStart, pageEnd);

  const canCreate = me.role === 'owner' || me.role === 'manager';

  const newClientOptions = useMemo(() => {
    const needle = newClientSearch.trim();
    if (!needle) return clients;
    return clients.filter((c) => textMatch(`${c.code} ${c.name}`, needle));
  }, [clients, newClientSearch]);

  useEffect(() => {
    if (!showAdd) return;
    let canceled = false;

    async function run() {
      if (form.billToType === 'CLIENT') {
        const clientId = form.clientId.trim();
        if (!clientId) {
          setSuggestions(null);
          return;
        }
        const clientRes = await fetch(`/api/clients/${encodeURIComponent(clientId)}`).catch(() => null);
        if (clientRes?.ok) {
          const j = (await clientRes.json().catch(() => null)) as
            | { ok?: boolean; client?: { name?: string; address?: string; phone?: string; email?: string } }
            | null;
          if (!canceled && j?.client) {
            setForm((p) => ({
              ...p,
              companyName: p.companyName || j.client?.name || '',
              address: p.address || j.client?.address || '',
              contactNo: p.contactNo || j.client?.phone || '',
              email: p.email || j.client?.email || '',
            }));
          }
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

      const companyName = form.companyName.trim();
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
  }, [form.billToType, form.clientId, form.companyName, showAdd]);

  const subtotal = computeSubtotal(items);
  const discount = round2(Math.max(0, safeNumber(form.discount)));
  const tax = round2(Math.max(0, safeNumber(form.tax)));
  const totalAmount = round2(Math.max(0, subtotal - discount + tax));

  async function reloadInvoices() {
    const res = await fetch('/api/invoices').catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { ok?: boolean; invoices?: Invoice[] } | null;
    if (!j?.invoices) return;
    const clientById = new Map(clients.map((c) => [c.id, c]));
    setInvoices(
      j.invoices.map((inv) => ({
        invoice: inv,
        client: inv.billTo.type === 'CLIENT' ? clientById.get(inv.billTo.clientId) ?? null : null,
        createdByName: '-',
      })),
    );
  }

  function resetNewInvoice() {
    setForm({
      issuer: 'BBY_SG',
      invoiceNo: '',
      billToType: 'CLIENT',
      clientId: '',
      companyName: '',
      address: '',
      contactNo: '',
      email: '',
      issueDate: todayYmd(),
      dueDate: '',
      creditTerm: 'Net 15',
      doNo: '',
      paymentMethod: 'As below',
      currency: 'SGD',
      fxUsdRate: '',
      fxCnyRate: '',
      discount: '',
      tax: '',
      notes: '',
      toEmailsText: '',
    });
    setItems([{ id: newTempId(), description: '', qty: 1, unitPrice: 0 }]);
    setNewClientSearch('');
    setNewClientOpen(false);
    setSuggestions(null);
    setCreatedInvoice(null);
  }

  async function addInvoice() {
    setError(null);
    if (form.billToType === 'CLIENT') {
      if (!form.clientId.trim()) {
        setError('INVALID_INPUT');
        return;
      }
    } else {
      if (!form.companyName.trim()) {
        setError('INVALID_INPUT');
        return;
      }
    }
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

    const splitEmails = (text: string) => {
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
    };
    const toEmails = splitEmails(form.toEmailsText);

    setCreating(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: form.issuer,
          invoiceNo: form.invoiceNo || undefined,
          billTo:
            form.billToType === 'CLIENT'
              ? {
                  type: 'CLIENT',
                  clientId: form.clientId,
                  companyName: form.companyName || undefined,
                  address: form.address || undefined,
                  contactNo: form.contactNo || undefined,
                  email: form.email || undefined,
                }
              : {
                  type: 'ONE_OFF',
                  companyName: form.companyName,
                  address: form.address || undefined,
                  contactNo: form.contactNo || undefined,
                  email: form.email || undefined,
                },
          issueDate: form.issueDate || undefined,
          dueDate: form.dueDate || undefined,
          creditTerm: form.creditTerm || undefined,
          doNo: form.doNo || undefined,
          paymentMethod: form.paymentMethod || undefined,
          currency: form.currency,
          fxUsdRate: form.fxUsdRate ? safeNumber(form.fxUsdRate) : undefined,
          fxCnyRate: form.fxCnyRate ? safeNumber(form.fxCnyRate) : undefined,
          discount: form.discount ? safeNumber(form.discount) : undefined,
          tax: form.tax ? safeNumber(form.tax) : undefined,
          notes: form.notes || undefined,
          recipients: { to: toEmails },
          items: normalizedItems,
          sendNow: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'CREATE_FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; invoice?: Invoice; send?: { ok?: boolean; error?: string } }
        | null;
      const inv = j?.invoice ?? null;
      if (inv) {
        const billTo = inv.billTo;
        const client = billTo.type === 'CLIENT' ? clients.find((c) => c.id === billTo.clientId) ?? null : null;
        setInvoices((prev) => [{ invoice: inv, client, createdByName: me.name }, ...prev]);
      }
      if (inv && j?.send && j.send.ok === false) {
        setCreatedInvoice(inv);
        setError(j.send.error ?? 'EMAIL_SEND_FAILED');
        return;
      }
      setShowAdd(false);
      resetNewInvoice();
    } finally {
      setCreating(false);
    }
  }

  async function retrySendCreated() {
    if (!createdInvoice) return;
    setError(null);
    const splitEmails = (text: string) => {
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
    };
    const toEmails = splitEmails(form.toEmailsText);
    if (!toEmails.length) {
      setError('MISSING_TO');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/invoices/${createdInvoice.id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: toEmails }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? 'EMAIL_SEND_FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; invoice?: Invoice } | null;
      if (j?.invoice) {
        setInvoices((prev) => prev.map((row) => (row.invoice.id === j.invoice!.id ? { ...row, invoice: j.invoice! } : row)));
      }
      setShowAdd(false);
      resetNewInvoice();
    } finally {
      setCreating(false);
    }
  }

  function exportCsv() {
    const header = [
      'Invoice No',
      'Issuer',
      'Bill To',
      'Client Code',
      'Client Name',
      'Issue Date',
      'Payment date',
      'Currency',
      'Total',
      'Status',
    ];
    const lines = [header.join(',')];
    for (const row of filtered) {
      const inv = row.invoice;
      const code = row.client?.code ?? '';
      const name = row.client?.name ?? '';
      lines.push(
        [
          toCsvValue(inv.invoiceNo),
          toCsvValue(inv.issuer),
          toCsvValue(inv.billTo.companyName ?? ''),
          toCsvValue(code),
          toCsvValue(name),
          toCsvValue(inv.issueDate ?? ''),
          toCsvValue(inv.paidAt ?? ''),
          toCsvValue(inv.currency),
          toCsvValue(String(inv.total)),
          toCsvValue(inv.status),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${todayYmd()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1">
      {filtersOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/30" onMouseDown={() => setFiltersOpen(false)}>
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
              <div className="text-base font-semibold">Filters</div>
              <button onClick={() => setFiltersOpen(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs text-black/60 mb-1">Status</div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as InvoiceStatus | '');
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-black/80 focus:ring-2 focus:ring-black/5"
                >
                  <option value="">All</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PAID">Paid</option>
                  <option value="VOID">Void</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-black/60 mb-1">Issuer</div>
                <select
                  value={issuerFilter}
                  onChange={(e) => {
                    setIssuerFilter(e.target.value as InvoiceIssuer | '');
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-black/80 focus:ring-2 focus:ring-black/5"
                >
                  <option value="">All</option>
                  <option value="BBY_SG">BBY.SG</option>
                  <option value="BYBRIDGE">Bybridge</option>
                </select>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-black/5 flex items-center justify-between">
              <button
                onClick={() => {
                  setStatusFilter('');
                  setIssuerFilter('');
                  setPage(1);
                }}
                className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm"
              >
                Clear
              </button>
              <button onClick={() => setFiltersOpen(false)} className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-xl font-semibold shrink-0">Invoices</h1>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[360px] max-w-[60vw] rounded-lg border border-black/10 px-3 text-sm outline-none bg-white text-black/80 placeholder:text-black/30 focus:ring-2 focus:ring-black/5"
                placeholder="Search invoices..."
              />
            </div>
            <div className="flex items-center gap-2">
            <button
              onClick={() => void reloadInvoices()}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium"
            >
              Refresh
            </button>
            <button
              onClick={() => exportCsv()}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium"
            >
              Export CSV
            </button>
            <button
              onClick={() => setFiltersOpen(true)}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium"
            >
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
            <button
              disabled={!canCreate}
              onClick={() => {
                setShowAdd(true);
                setError(null);
                resetNewInvoice();
              }}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              + New Invoice
            </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end">
          <PaginationControls
            total={total}
            pageStart={pageStart}
            pageEnd={pageEnd}
            page={safePage}
            totalPages={totalPages}
            pageSize={safePageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5">
          <table className="w-full text-sm table-auto">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/10 bg-black/[0.02]">
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Bill To</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Invoice No</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Issuer</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Issue Date</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Payment date</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Total</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Status</div>
                </th>
                <th className="px-3 py-3 align-top">
                  <div className="text-[11px] font-semibold text-black/50 tracking-wide">Created by</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const inv = row.invoice;
                const s = statusLabel(inv.status);
                return (
                  <tr key={inv.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-3 py-3 overflow-hidden">
                      {row.client ? (
                        <div className="truncate" title={`${row.client.code} ${row.client.name}`}>
                        <div className="block truncate text-black/80">
                          {row.client.code} {row.client.name}
                        </div>
                        </div>
                      ) : (
                        <div className="truncate text-black/80" title={inv.billTo.companyName || '-'}>
                          {inv.billTo.companyName || '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Link className="text-[#2f7bdc] hover:underline" href={`/invoices/${inv.id}`}>
                        {inv.invoiceNo}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-black/70">{inv.issuer}</td>
                    <td className="px-3 py-3">{formatDateDMY(inv.issueDate)}</td>
                    <td className="px-3 py-3">{inv.paidAt ? formatDateDMY(inv.paidAt) : '-'}</td>
                    <td className="px-3 py-3">{formatMoney(inv.currency, inv.total)}</td>
                    <td className="px-3 py-3">
                      <span className={['inline-flex px-2 py-1 rounded-full text-xs font-semibold', s.cls].join(' ')}>
                        {s.text}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-black/70">{row.createdByName}</td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-black/50">
                    No invoices
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {showAdd ? (
          <div
            className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4"
            onMouseDown={() => {
              setShowAdd(false);
              setNewClientOpen(false);
            }}
          >
            <div
              className="w-full max-w-3xl rounded-2xl bg-white shadow-lg border border-black/10 flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">New Invoice</div>
                <button
                  onClick={() => {
                    setShowAdd(false);
                    setNewClientOpen(false);
                  }}
                  className="text-black/50 hover:text-black"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6">
                {error ? <div className="text-sm text-red-600">{error}</div> : null}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-black/60 mb-1">Bill To Type</div>
                  <select
                    value={form.billToType}
                    onChange={(e) => {
                      const v = e.target.value as 'CLIENT' | 'ONE_OFF';
                      setForm((p) => ({
                        ...p,
                        billToType: v,
                        clientId: v === 'CLIENT' ? p.clientId : '',
                        companyName: v === 'CLIENT' ? p.companyName : p.companyName,
                      }));
                      setNewClientOpen(false);
                    }}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                  >
                    <option value="CLIENT">Existing client</option>
                    <option value="ONE_OFF">One-off company</option>
                  </select>
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">Issuer Company</div>
                  <select
                    value={form.issuer}
                    onChange={(e) => setForm((p) => ({ ...p, issuer: e.target.value as InvoiceIssuer }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                  >
                    <option value="BBY_SG">BBY.SG Pte. Ltd.</option>
                    <option value="BYBRIDGE">Bybridge Consultancy Pte. Ltd.</option>
                  </select>
                </div>

                {form.billToType === 'CLIENT' ? (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-black/60 mb-1">Company</div>
                    <div className="relative">
                      <button
                        type="button"
                        className="w-full text-left rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                        onClick={() => {
                          setNewClientOpen((v) => !v);
                          setTimeout(() => clientSearchRef.current?.focus(), 0);
                        }}
                      >
                        {(() => {
                          const c = clients.find((x) => x.id === form.clientId) ?? null;
                          return c ? `${c.code} ${c.name}` : 'Select client...';
                        })()}
                      </button>
                      {newClientOpen ? (
                        <div className="absolute z-[90] mt-1 w-full rounded-xl border border-black/10 bg-white shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-black/5">
                            <input
                              ref={clientSearchRef}
                              value={newClientSearch}
                              onChange={(e) => setNewClientSearch(e.target.value)}
                              className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none"
                              placeholder="Search client..."
                            />
                          </div>
                          <div className="max-h-64 overflow-auto">
                            {newClientOptions.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-black/[0.03]"
                                onClick={() => {
                                  setForm((p) => ({ ...p, clientId: c.id, companyName: '' }));
                                  setNewClientOpen(false);
                                }}
                              >
                                <div className="font-medium">{c.code}</div>
                                <div className="text-black/60">{c.name}</div>
                              </button>
                            ))}
                            {newClientOptions.length === 0 ? (
                              <div className="px-3 py-4 text-sm text-black/50">No results</div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-black/60 mb-1">Company Name</div>
                    <input
                      value={form.companyName}
                      onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                      className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                      placeholder="e.g. ABC Pte. Ltd."
                    />
                  </div>
                )}

                <div>
                  <div className="text-xs text-black/60 mb-1">Invoice No (optional)</div>
                  <input
                    value={form.invoiceNo}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceNo: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    placeholder="Auto generate if empty"
                  />
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">Currency</div>
                  <select
                    value={form.currency}
                    onChange={(e) => {
                      const next = e.target.value as Currency;
                      setForm((p) => ({
                        ...p,
                        currency: next,
                        fxUsdRate: next === 'SGD' ? p.fxUsdRate : '',
                        fxCnyRate: next === 'SGD' ? p.fxCnyRate : '',
                      }));
                    }}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
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
                  <DateInputYMD
                    value={form.issueDate}
                    onChange={(v) => setForm((p) => ({ ...p, issueDate: v }))}
                    inputClassName="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                  />
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">Due Date (optional)</div>
                  <DateInputYMD
                    value={form.dueDate}
                    onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))}
                    inputClassName="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                  />
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">Credit Term</div>
                  <input
                    value={form.creditTerm}
                    onChange={(e) => setForm((p) => ({ ...p, creditTerm: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    placeholder="Net 15"
                  />
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">D/O No. (optional)</div>
                  <input
                    value={form.doNo}
                    onChange={(e) => setForm((p) => ({ ...p, doNo: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">Payment Method</div>
                  <input
                    value={form.paymentMethod}
                    onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    placeholder="As below"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">Address</div>
                  <textarea
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    rows={2}
                  />
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">Contact No. (optional)</div>
                  <input
                    value={form.contactNo}
                    onChange={(e) => setForm((p) => ({ ...p, contactNo: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                  />
                </div>

                <div>
                  <div className="text-xs text-black/60 mb-1">Email (optional)</div>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    inputMode="email"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">To Emails (space/comma separated)</div>
                  <input
                    value={form.toEmailsText}
                    onChange={(e) => setForm((p) => ({ ...p, toEmailsText: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    placeholder="e.g. director@company.com"
                  />
                  {suggestions?.notifyPeople?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.notifyPeople.map((p) => (
                        <button
                          key={`${p.role}:${p.email}`}
                          type="button"
                          onClick={() => {
                            const email = p.email.trim();
                            if (!email) return;
                            setForm((prev) => {
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
                  {suggestions?.history?.toEmails?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.history.toEmails.map((e) => (
                        <button
                          key={`to:${e}`}
                          type="button"
                          onClick={() => {
                            const email = e.trim();
                            if (!email) return;
                            setForm((prev) => {
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
                {form.currency === 'SGD' ? (
                  <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                    <div>
                      <div className="text-xs text-black/60 mb-1">USD/SGD rate (optional)</div>
                      <input
                        value={form.fxUsdRate}
                        onChange={(e) => setForm((p) => ({ ...p, fxUsdRate: e.target.value }))}
                        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                        inputMode="decimal"
                        placeholder="e.g. 0.80"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-black/60 mb-1">SGD/CNY rate (1 SGD → CNY, optional)</div>
                      <input
                        value={form.fxCnyRate}
                        onChange={(e) => setForm((p) => ({ ...p, fxCnyRate: e.target.value }))}
                        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
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
                      value={form.discount}
                      onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))}
                      className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-black/60 mb-1">Tax (optional)</div>
                    <input
                      value={form.tax}
                      onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))}
                      className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-black/60 mb-1">Notes (optional)</div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
                    rows={2}
                  />
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Items</div>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => [...prev, { id: newTempId(), description: '', qty: 1, unitPrice: 0 }])}
                    className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm"
                  >
                    + Add item
                  </button>
                </div>

                <div className="mt-2 rounded-xl border border-black/10 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-black/60 bg-black/[0.02]">
                      <tr className="border-b border-black/5">
                        <th className="px-3 py-2 font-medium min-w-[220px]">Description</th>
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
                                value={it.description}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, description: v } : x)));
                                }}
                                className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none"
                                placeholder="e.g. Accounting service"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={String(it.qty)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setItems((prev) =>
                                    prev.map((x) => (x.id === it.id ? { ...x, qty: safeNumber(v) } : x)),
                                  );
                                }}
                                className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={String(it.unitPrice)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setItems((prev) =>
                                    prev.map((x) => (x.id === it.id ? { ...x, unitPrice: safeNumber(v) } : x)),
                                  );
                                }}
                                className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm outline-none"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatMoney(form.currency, amount)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={items.length <= 1}
                                onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                                className="rounded-md border border-red-200 bg-white text-red-600 px-2 py-1 text-xs hover:bg-red-50 disabled:opacity-40"
                              >
                                Delete
                              </button>
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
                    <div className="min-w-[140px] text-right">{formatMoney(form.currency, subtotal)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-black/60">Discount</div>
                    <div className="min-w-[140px] text-right">{formatMoney(form.currency, discount)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-black/60">Tax</div>
                    <div className="min-w-[140px] text-right">{formatMoney(form.currency, tax)}</div>
                  </div>
                  <div className="flex items-center gap-2 font-semibold">
                    <div>Total</div>
                    <div className="min-w-[140px] text-right">{formatMoney(form.currency, totalAmount)}</div>
                  </div>
                </div>
              </div>
              </div>

              <div className="border-t border-black/5 px-4 sm:px-6 py-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAdd(false);
                    setNewClientOpen(false);
                  }}
                  className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                {createdInvoice ? (
                  <>
                    <Link
                      className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm"
                      href={`/invoices/${createdInvoice.id}`}
                    >
                      Open Invoice
                    </Link>
                    <button
                      disabled={creating}
                      onClick={() => void retrySendCreated()}
                      className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                    >
                      {creating ? 'Sending...' : 'Retry Send'}
                    </button>
                  </>
                ) : (
                  <button
                    disabled={creating}
                    onClick={() => void addInvoice()}
                    className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    {creating ? 'Creating & sending...' : 'Create & Send'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
