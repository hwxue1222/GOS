'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProviderClient';
import { usePersistedState } from '@/lib/usePersistedState';
import PaginationControls from '@/components/PaginationControls';

type CompanyRow = {
  client: {
    id: string;
    code: string;
    name: string;
    companyRegistrationNo?: string;
    contactPerson?: string;
    paidUpCapitalCurrency?: string;
    paidUpCapitalAmount?: number;
    totalShares?: number;
    incorporationDate?: string;
    registeredOfficeAddress?: string;
    createdAt: string;
  };
  directors: string[];
  shareholders: string[];
  rorc: string[];
  secretaries: string[];
};

type Props = {
  initialItems: CompanyRow[];
  canEdit: boolean;
  canViewPeople?: boolean;
};

function money(currency?: string, amount?: number) {
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount)) return '-';
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SecretaryCompaniesClient({ initialItems, canEdit, canViewPeople }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = usePersistedState('gos.secretary.companies.page', 1);
  const [pageSize, setPageSize] = usePersistedState('gos.secretary.companies.pageSize', 20);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialItems;
    return initialItems.filter((it) => {
      const hay = [
        it.client.name,
        it.client.code,
        it.client.companyRegistrationNo ?? '',
        it.client.contactPerson ?? '',
        ...it.rorc,
        ...it.secretaries,
        ...it.directors,
        ...it.shareholders,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [initialItems, search]);

  const safePageSize = Math.max(5, Math.min(200, Number(pageSize) || 20));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.max(1, Math.min(totalPages, Number(page) || 1));
  const pageStart = (safePage - 1) * safePageSize;
  const pageEnd = Math.min(total, pageStart + safePageSize);
  const visible = useMemo(() => items.slice(pageStart, pageEnd), [items, pageStart, pageEnd]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold whitespace-nowrap">{t('nav.secretary')}</h1>
          <div className="mt-1 text-sm text-black/60">{t('secretary.companies')}</div>
        </div>
        <div className="flex items-center gap-2 w-full justify-end">
          {canViewPeople ? (
            <Link
              href="/secretary/people"
              className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
            >
              {t('secretary.peopleLibrary')}
            </Link>
          ) : null}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search company, reg no, person"
            className="w-full max-w-md rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
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
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-black/2">
            <tr className="text-left text-black/60">
              <th className="px-4 py-3">{t('secretary.companies')}</th>
              <th className="px-4 py-3">{t('secretary.regNo')}</th>
              <th className="px-4 py-3">{t('secretary.paidUpCapital')}</th>
              <th className="px-4 py-3">{t('secretary.totalShares')}</th>
              <th className="px-4 py-3">{t('secretary.rorcController')}</th>
              <th className="px-4 py-3">{t('secretary.secretaryRole')}</th>
              <th className="px-4 py-3">{t('secretary.directors')}</th>
              <th className="px-4 py-3">{t('secretary.shareholders')}</th>
              <th className="px-4 py-3">{t('secretary.createdAt')}</th>
              <th className="px-4 py-3">{t('secretary.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((it) => (
              <tr key={it.client.id} className="border-t border-black/5">
                <td className="px-4 py-3">
                  <div className="font-medium text-[#2f7bdc]">
                    <Link href={`/secretary/companies/${it.client.id}`}>{it.client.name}</Link>
                  </div>
                </td>
                <td className="px-4 py-3">{it.client.companyRegistrationNo ?? '-'}</td>
                <td className="px-4 py-3">{money(it.client.paidUpCapitalCurrency, it.client.paidUpCapitalAmount)}</td>
                <td className="px-4 py-3">{typeof it.client.totalShares === 'number' ? it.client.totalShares.toLocaleString() : '-'}</td>
                <td className="px-4 py-3">{it.rorc.length ? it.rorc.join(', ') : '-'}</td>
                <td className="px-4 py-3">{it.secretaries.length ? it.secretaries.join(', ') : '-'}</td>
                <td className="px-4 py-3">{it.directors.length ? it.directors.join(', ') : '-'}</td>
                <td className="px-4 py-3">{it.shareholders.length ? it.shareholders.join(', ') : '-'}</td>
                <td className="px-4 py-3">{it.client.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/secretary/companies/${it.client.id}`}
                      className="rounded-md bg-[#2f7bdc] text-white px-3 py-1.5 text-xs font-medium"
                    >
                      {canEdit ? t('common.edit') : t('common.view')}
                    </Link>
                    <Link
                      href={`/secretary/share-transfers?clientId=${encodeURIComponent(it.client.id)}`}
                      className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium"
                    >
                      {t('common.files')}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-black/50">
                  {t('common.noResults')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
