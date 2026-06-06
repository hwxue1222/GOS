'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePersistedState } from '@/lib/usePersistedState';
import PaginationControls from '@/components/PaginationControls';

import type { Role } from '@/lib/types';

type Client = {
  id: string;
  code: string;
  name: string;
  fka?: string;
  companyRegistrationNo?: string;
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  tags: string[];
  deletedAt?: string;
};

type User = { id: string; name: string; email: string; role: Role };

type Props = {
  initialMe: User;
  initialClients: Client[];
};

function textMatch(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

export default function ClientsClient({ initialMe, initialClients }: Props) {
  const [me] = useState<User>(initialMe);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = usePersistedState('gos.clients.search', '');
  const [pageSize, setPageSize] = usePersistedState('gos.clients.pageSize', 20);
  const [page, setPage] = usePersistedState('gos.clients.page', 1);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ updated: number; skippedSc: number; notFound: string[] } | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    fka: '',
    companyRegistrationNo: '',
    fye: '',
    contactPerson: '',
    address: '',
    phone: '',
    email: '',
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    return clients.filter((c) =>
      textMatch(
        `${c.code} ${c.name} ${c.fka ?? ''} ${c.companyRegistrationNo ?? ''} ${c.fye ?? ''} ${c.contactPerson ?? ''} ${c.address ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`,
        search,
      ),
    );
  }, [clients, search]);

  const total = filtered.length;
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const pageStart = (safePage - 1) * safePageSize;
  const pageEnd = Math.min(total, pageStart + safePageSize);
  const visible = filtered.slice(pageStart, pageEnd);

  const canCreate = me?.role === 'owner' || me?.role === 'manager';

  function parseBulkUpdates(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const updates: Array<{
      uen: string;
      registeredOfficeAddress?: string;
      incorporationDate?: string;
      businessActivities?: string;
    }> = [];
    for (const line of lines) {
      const tabParts = line.split('\t');
      const parts = tabParts.length >= 2 ? tabParts : line.split(',');
      const [uenRaw, regOfficeRaw, incRaw, bizRaw] = parts.map((p) => (p ?? '').trim());
      const uen = (uenRaw ?? '').trim();
      if (!uen) continue;
      const regOffice = (regOfficeRaw ?? '').trim();
      const inc = (incRaw ?? '').trim();
      const biz = (bizRaw ?? '').trim();
      updates.push({
        uen,
        registeredOfficeAddress: regOffice || undefined,
        incorporationDate: inc || undefined,
        businessActivities: biz || undefined,
      });
    }
    return updates;
  }

  async function applyBulkUpdates() {
    setBulkResult(null);
    const updates = parseBulkUpdates(bulkText);
    if (updates.length === 0) {
      setBulkResult({ updated: 0, skippedSc: 0, notFound: [] });
      return;
    }
    setBulkApplying(true);
    try {
      const res = await fetch('/api/admin/bulk-update/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ updates }),
      }).catch(() => null);
      if (!res?.ok) {
        setBulkResult({ updated: 0, skippedSc: 0, notFound: [] });
        return;
      }
      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            updated?: number;
            skippedSc?: number;
            notFound?: string[];
            updatedClients?: Array<{
              id: string;
              registeredOfficeAddress?: string;
              incorporationDate?: string;
              businessActivities?: string;
            }>;
          }
        | null;
      if (!j?.ok) {
        setBulkResult({ updated: 0, skippedSc: 0, notFound: [] });
        return;
      }
      const updatedClients = Array.isArray(j.updatedClients) ? j.updatedClients : [];
      const updatedById = new Map(updatedClients.map((c) => [c.id, c]));
      if (updatedById.size) {
        setClients((prev) => prev.map((c) => (updatedById.has(c.id) ? { ...c, ...updatedById.get(c.id)! } : c)));
      }
      setBulkResult({
        updated: Number(j.updated ?? 0) || 0,
        skippedSc: Number(j.skippedSc ?? 0) || 0,
        notFound: Array.isArray(j.notFound) ? j.notFound : [],
      });
    } finally {
      setBulkApplying(false);
    }
  }

  async function addClient() {
    setError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setError('INVALID_INPUT');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          fka: form.fka || undefined,
          companyRegistrationNo: form.companyRegistrationNo || undefined,
          fye: form.fye || undefined,
          contactPerson: form.contactPerson || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'CREATE_FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; client?: Client } | null;
      if (j?.client) setClients((prev) => [j.client!, ...prev]);
      setShowAdd(false);
      setForm({ code: '', name: '', fka: '', companyRegistrationNo: '', fye: '', contactPerson: '', address: '', phone: '', email: '' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Clients</h1>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-64 max-w-[60vw] rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
              placeholder="Find client..."
            />
            <button
              disabled={!canCreate}
              onClick={() => setShowAdd(true)}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              + Add Client
            </button>
            <button
              disabled={!canCreate}
              onClick={() => {
                setBulkResult(null);
                setShowBulkUpdate(true);
              }}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Bulk Update
            </button>
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

        <div className="mt-4 rounded-xl bg-white border border-black/5 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/5">
                <th className="px-2 py-2 font-medium whitespace-nowrap">Code</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Client</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Reg no.</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">FYE</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Contact</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Address</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Phone</th>
                <th className="px-2 py-2 font-medium whitespace-nowrap">Email</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                  <td className="px-2 py-2 whitespace-nowrap">{c.code}</td>
                  <td className="px-2 py-2 min-w-[180px] max-w-[280px]">
                    <Link
                      className="text-[#2f7bdc] hover:underline block leading-tight break-words"
                      href={`/clients/${c.id}`}
                      title={`${c.name} (Code: ${c.code})`}
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 min-w-[120px] max-w-[160px]">
                    <div className="leading-tight break-words" title={c.companyRegistrationNo ?? ''}>
                      {c.companyRegistrationNo?.trim() ? c.companyRegistrationNo : '-'}
                    </div>
                  </td>
                  <td className="px-2 py-2 min-w-[90px] max-w-[120px]">
                    <div className="leading-tight break-words" title={c.fye ?? ''}>
                      {c.fye?.trim() ? c.fye : '-'}
                    </div>
                  </td>
                  <td className="px-2 py-2 min-w-[120px] max-w-[160px]">
                    <div className="leading-tight break-words" title={c.contactPerson ?? ''}>
                      {c.contactPerson?.trim() ? c.contactPerson : '-'}
                    </div>
                  </td>
                  <td className="px-2 py-2 min-w-[160px] max-w-[260px]">
                    <div className="leading-tight break-words" title={c.address ?? ''}>
                      {c.address?.trim() ? c.address : '-'}
                    </div>
                  </td>
                  <td className="px-2 py-2 min-w-[110px] max-w-[160px]">
                    <div className="leading-tight break-words" title={c.phone ?? ''}>
                      {c.phone?.trim() ? c.phone : '-'}
                    </div>
                  </td>
                  <td className="px-2 py-2 min-w-[160px] max-w-[240px]">
                    <div className="leading-tight break-words" title={c.email ?? ''}>
                      {c.email?.trim() ? c.email : '-'}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-black/50">
                    No clients
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Add Client</div>
              <button onClick={() => setShowAdd(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>

            {!canCreate ? (
              <div className="mt-4 text-sm text-red-600">FORBIDDEN</div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-black/70">Code</div>
                    <input
                      value={form.code}
                      onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="e.g. DA141"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Name</div>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Client name"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <div className="text-black/70">FKA (Formerly known as)</div>
                    <input
                      value={form.fka}
                      onChange={(e) => setForm((v) => ({ ...v, fka: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="e.g. Bybridge Sdn Bhd"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <div className="text-black/70">Company registration no.</div>
                    <input
                      value={form.companyRegistrationNo}
                      onChange={(e) => setForm((v) => ({ ...v, companyRegistrationNo: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Company registration no."
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <div className="text-black/70">FYE (Financial year end)</div>
                    <input
                      value={form.fye}
                      onChange={(e) => setForm((v) => ({ ...v, fye: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="e.g. 31/12"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <div className="text-black/70">Contact person</div>
                    <input
                      value={form.contactPerson}
                      onChange={(e) => setForm((v) => ({ ...v, contactPerson: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Contact person"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <div className="text-black/70">Address</div>
                    <textarea
                      value={form.address}
                      onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      rows={3}
                      placeholder="Address"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Phone</div>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Phone"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Email</div>
                    <input
                      value={form.email}
                      onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Email"
                    />
                  </label>
                </div>

                {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowAdd(false)}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={creating}
                    onClick={addClient}
                    className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {creating ? 'Saving...' : 'Add'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showBulkUpdate ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Bulk Update (by UEN)</div>
              <button onClick={() => setShowBulkUpdate(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>

            <div className="mt-2 text-xs text-black/60 leading-relaxed">
              Paste lines as TSV: <span className="font-mono">UEN\tRegistered office address\tIncorporation date\tBusiness activities</span>
            </div>

            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="mt-3 w-full min-h-[260px] rounded-lg border border-black/10 px-3 py-2 text-xs outline-none bg-white font-mono"
              placeholder={`202503155H\t10 ANSON ROAD #10-11\t2025-01-20\tGeneral trading`}
            />

            {bulkResult ? (
              <div className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-black/70">
                Updated: {bulkResult.updated} | Skipped (SC): {bulkResult.skippedSc} | Not found: {bulkResult.notFound.length}
              </div>
            ) : null}

            {bulkResult?.notFound?.length ? (
              <div className="mt-2 text-xs text-red-600 break-words">Not found: {bulkResult.notFound.join(', ')}</div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setBulkText('');
                  setBulkResult(null);
                }}
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium"
              >
                Clear
              </button>
              <button
                disabled={!canCreate || bulkApplying}
                onClick={() => void applyBulkUpdates()}
                className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {bulkApplying ? 'Updating…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
