'use client';

import { useI18n } from '@/components/I18nProviderClient';

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
  companyNames?: string[];
  createdAt: string;
};

function tagClass(role: string) {
  if (role === 'DIRECTOR') return 'bg-blue-50 text-blue-700 border-blue-100';
  if (role === 'SHAREHOLDER') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (role === 'SECRETARY') return 'bg-purple-50 text-purple-700 border-purple-100';
  if (role === 'RORC') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-black/5 text-black/70 border-black/10';
}

function normalizeCarToSar(value: string | undefined) {
  const s = String(value ?? '').trim();
  if (!s) return undefined;
  return s.replace(/\bcar\b/gi, 'sar');
}

function date10(value: unknown) {
  const s = typeof value === 'string' ? value : '';
  return s ? s.slice(0, 10) : '-';
}

type Props = {
  members: Member[];
  loading: boolean;
  onFillMissing?: (memberId: string) => void;
  onEdit?: (memberId: string) => void;
  onDelete?: (memberId: string) => void;
};

export default function MembersTable({ members, loading, onFillMissing, onEdit, onDelete }: Props) {
  const { t, lang } = useI18n();

  const roleLabel = (role: string) => {
    if (role === 'DIRECTOR') return t('roles.director');
    if (role === 'SHAREHOLDER') return t('roles.shareholder');
    if (role === 'RORC') return t('roles.rorc');
    if (role === 'SECRETARY') return t('roles.secretary');
    return role;
  };

  return (
    <div className="mt-6 rounded-xl bg-white border border-black/5 overflow-x-auto">
      <table className="min-w-[1650px] w-full text-sm">
        <thead className="bg-black/2">
          <tr className="text-left text-black/60">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">{t('people.tags')}</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Nationality</th>
            <th className="px-4 py-3">DOB</th>
            <th className="px-4 py-3">Address</th>
            <th className="px-4 py-3">Member since</th>
            <th className="px-4 py-3">Last login</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={12} className="px-4 py-10 text-center text-black/50">
                Loading...
              </td>
            </tr>
          ) : null}
          {!loading
            ? members.map((p) => (
                <tr key={p.id} className="border-t border-black/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={p.fullName ? 'font-medium' : 'font-medium text-black/40'}>{p.fullName || '-'}</span>
                      {!p.fullName && onFillMissing ? (
                        <button type="button" onClick={() => onFillMissing(p.id)} className="text-xs text-[#2f7bdc] hover:underline">
                          Fill
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.roleTags ?? []).length ? (
                        p.roleTags!.map((r) => (
                          <span key={r} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tagClass(r)}`}>
                            {roleLabel(r)}
                          </span>
                        ))
                      ) : (
                        <span className="text-black/40 text-xs">-</span>
                      )}
                      {typeof p.companyCount === 'number' && p.companyCount > 0 ? (
                        <span
                          className="inline-flex items-center rounded-full border border-black/10 bg-white px-2 py-0.5 text-xs text-black/60"
                          title={(p.companyNames ?? []).length ? p.companyNames!.join('\n') : undefined}
                        >
                          {lang === 'zh' ? `${p.companyCount}${t('people.companyCountSuffix')}` : `${p.companyCount} ${t('people.companyCountSuffix')}`}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.email ?? '-'}</td>
                  <td className="px-4 py-3">{p.phone ?? '-'}</td>
                  <td className="px-4 py-3">{p.idNo ?? '-'}</td>
                  <td className="px-4 py-3">{normalizeCarToSar(p.nationality) ?? '-'}</td>
                  <td className="px-4 py-3">{p.dob ?? '-'}</td>
                  <td className="px-4 py-3 max-w-[420px]">
                    {p.address ? (
                      <div className="truncate" title={p.address}>
                        {p.address}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">{date10(p.memberSince)}</td>
                  <td className="px-4 py-3">{date10(p.lastLoginDate)}</td>
                  <td className="px-4 py-3">{date10(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {onEdit ? (
                        <button type="button" onClick={() => onEdit(p.id)} className="text-xs text-[#2f7bdc] hover:underline">
                          Edit
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button type="button" onClick={() => onDelete(p.id)} className="text-xs text-red-600 hover:underline">
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            : null}
          {!loading && members.length === 0 ? (
            <tr>
              <td colSpan={12} className="px-4 py-10 text-center text-black/50">
                {t('common.noResults')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
