'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import CreatePersonCard from '@/app/(app)/secretary/people/ui/CreatePersonCard';
import ExcelImportCard from '@/app/(app)/secretary/people/ui/ExcelImportCard';
import PeopleTable from '@/app/(app)/secretary/people/ui/PeopleTable';

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
  createdAt: string;
};

type Props = {
  canImport: boolean;
  canCreate: boolean;
};

export default function PeopleClient({ canImport, canCreate }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/people', { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) {
        setError(`HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; people?: Person[] } | null;
      setPeople(Array.isArray(j?.people) ? j!.people : []);
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


  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-black/60">
            <Link href="/secretary/companies" className="text-[#2f7bdc] hover:underline">
              Companies
            </Link>
            <span className="mx-2 text-black/30">/</span>
            <span className="text-black/70">People</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold">人员库</h1>
          <div className="mt-1 text-sm text-black/60">Excel 导入后，在公司详情页选择董事/股东/RORC/秘书。</div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name/email/phone/id"
          className="w-full max-w-md rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
        />
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      {ok ? <div className="mt-3 text-sm text-[#46b35a]">{ok}</div> : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExcelImportCard
          canImport={canImport}
          onError={(m) => setError(m)}
          onImported={async (m) => {
            setOk(m);
            await refresh();
          }}
        />

        <CreatePersonCard
          canCreate={canCreate}
          onError={(m) => setError(m)}
          onCreated={async (m) => {
            setOk(m);
            await refresh();
          }}
        />
      </div>

      <PeopleTable people={filtered} loading={loading} />
    </div>
  );
}
