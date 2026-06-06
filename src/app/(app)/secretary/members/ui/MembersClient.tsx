'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProviderClient';
import { usePersistedState } from '@/lib/usePersistedState';
import PaginationControls from '@/components/PaginationControls';
import MembersTable from '@/app/(app)/secretary/members/ui/MembersTable';

type Member = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
  memberSince?: string;
  lastLoginDate?: string;
  roleTags?: Array<'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY'>;
  companyCount?: number;
  createdAt: string;
};

export default function MembersClient() {
  const { t } = useI18n();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = usePersistedState('gos.secretary.members.page', 1);
  const [pageSize, setPageSize] = usePersistedState('gos.secretary.members.pageSize', 20);
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    idNo: '',
    nationality: '',
    dob: '',
    address: '',
  });

  const normalizeCarToSar = (v: string) => v.replace(/\bcar\b/gi, 'sar');

  async function refresh() {
    const res = await fetch('/api/secretary/members').catch(() => null);
    if (!res?.ok) {
      setError(`HTTP_${res?.status ?? 'NETWORK'}`);
      setLoading(false);
      return;
    }
    const j = (await res.json().catch(() => null)) as { ok?: boolean; items?: Member[] } | null;
    if (!j?.ok || !Array.isArray(j.items)) {
      setError('INVALID_RESPONSE');
      setLoading(false);
      return;
    }
    setMembers(j.items);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((p) => {
      const hay = [p.fullName, p.email ?? '', p.phone ?? '', p.idNo ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [members, search]);

  const safePageSize = Math.max(5, Math.min(100, Number(pageSize) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, pageCount);
  const start = (currentPage - 1) * safePageSize;
  const end = Math.min(total, start + safePageSize);
  const visible = filtered.slice(start, end);

  async function addMember() {
    setError(null);
    const fullName = form.fullName.trim();
    if (!fullName) {
      setError('INVALID_INPUT');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          idNo: form.idNo.trim() || undefined,
          nationality: form.nationality.trim() ? normalizeCarToSar(form.nationality.trim()) : undefined,
          dob: form.dob.trim() || undefined,
          address: form.address.trim() || undefined,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setShowAdd(false);
      setForm({ fullName: '', email: '', phone: '', idNo: '', nationality: '', dob: '', address: '' });
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[#2f7bdc] text-sm">
            <Link href="/secretary/companies" className="hover:underline">
              Companies
            </Link>
            <span className="mx-2 text-black/30">/</span>
            <span className="text-black/70">Members</span>
          </div>
          <div className="mt-1 text-2xl font-bold">Members</div>
          <div className="mt-1 text-sm text-black/50">Assign roles in company detail.</div>
        </div>
        <div className="flex items-center gap-2 w-full justify-end">
          <button
            onClick={() => {
              setError(null);
              setShowAdd(true);
            }}
            className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
          >
            + Add
          </button>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('people.searchPlaceholder')}
            className="w-full max-w-md rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <PaginationControls
          total={total}
          pageStart={total ? start + 1 : 0}
          pageEnd={end}
          page={currentPage}
          totalPages={pageCount}
          pageSize={safePageSize}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      <MembersTable members={visible} loading={loading} />

      {showAdd ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Add Member</div>
              <button onClick={() => setShowAdd(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">Name</div>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm((v) => ({ ...v, fullName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="Full name"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/60">Email</div>
                <input
                  value={form.email}
                  onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="email@example.com"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/60">Phone</div>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="+65..."
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">ID</div>
                <input
                  value={form.idNo}
                  onChange={(e) => setForm((v) => ({ ...v, idNo: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="NRIC / Passport"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/60">Nationality</div>
                <input
                  value={form.nationality}
                  onChange={(e) => setForm((v) => ({ ...v, nationality: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="Singaporean"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/60">DOB</div>
                <input
                  value={form.dob}
                  onChange={(e) => setForm((v) => ({ ...v, dob: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="YYYY-MM-DD"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">Address</div>
                <input
                  value={form.address}
                  onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="Address"
                />
              </label>
            </div>

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                disabled={creating}
                onClick={() => void addMember()}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                {creating ? 'Saving...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
