'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PeopleTable from '@/app/(app)/secretary/people/ui/PeopleTable';
import { useI18n } from '@/components/I18nProviderClient';
import { usePersistedState } from '@/lib/usePersistedState';
import PaginationControls from '@/components/PaginationControls';

type Person = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  idType?: 'NRIC' | 'PASSPORT' | 'OTHER';
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

export default function PeopleClient() {
  const { t } = useI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = usePersistedState('gos.secretary.people.page', 1);
  const [pageSize, setPageSize] = usePersistedState('gos.secretary.people.pageSize', 20);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/secretary/people', { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) {
        setError(`HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; items?: Person[] } | null;
      setPeople(Array.isArray(j?.items) ? j!.items : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => `${p.fullName} ${p.email ?? ''} ${p.phone ?? ''} ${p.idNo ?? ''}`.toLowerCase().includes(q));
  }, [people, search]);

  const safePageSize = Math.max(5, Math.min(200, Number(pageSize) || 20));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, Number(page) || 1));
  const pageStart = (safePage - 1) * safePageSize;
  const pageEnd = Math.min(total, pageStart + safePageSize);
  const visible = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);


  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-black/60">
            <Link href="/secretary/companies" className="text-[#2f7bdc] hover:underline">
              {t('secretary.companies')}
            </Link>
            <span className="mx-2 text-black/30">/</span>
            <span className="text-black/70">{t('secretary.peopleLibrary')}</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold">{t('secretary.peopleLibrary')}</h1>
          <div className="mt-1 text-sm text-black/60">{t('people.hint')}</div>
        </div>
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

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      <PeopleTable people={visible} loading={loading} />
    </div>
  );
}
