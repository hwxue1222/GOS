'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProviderClient';
import { usePersistedState } from '@/lib/usePersistedState';
import PaginationControls from '@/components/PaginationControls';
import MembersTable from './MembersTable';
import SecretarySubNavClient from '@/app/(app)/secretary/ui/SecretarySubNavClient';
import { DateInputYMD } from '@/components/DateInputYMD';

type Member = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  idType?: 'NRIC' | 'FIN' | 'PASSPORT' | 'IC' | 'OTHER';
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
  memberSince?: string;
  lastLoginDate?: string;
  roleTags?: Array<'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY'>;
  companyCount?: number;
  companyNames?: string[];
  companyRoles?: Array<{ clientId: string; clientName: string; roles: Array<'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY'> }>;
  createdAt: string;
};

const PHONE_COUNTRY_CODES = [
  { label: 'SG +65', value: '+65' },
  { label: 'CN +86', value: '+86' },
  { label: 'HK +852', value: '+852' },
  { label: 'TW +886', value: '+886' },
  { label: 'MY +60', value: '+60' },
  { label: 'ID +62', value: '+62' },
  { label: 'TH +66', value: '+66' },
  { label: 'VN +84', value: '+84' },
  { label: 'PH +63', value: '+63' },
  { label: 'JP +81', value: '+81' },
  { label: 'KR +82', value: '+82' },
  { label: 'US +1', value: '+1' },
  { label: 'CA +1', value: '+1' },
  { label: 'AU +61', value: '+61' },
  { label: 'NZ +64', value: '+64' },
  { label: 'UK +44', value: '+44' },
  { label: 'DE +49', value: '+49' },
  { label: 'FR +33', value: '+33' },
  { label: 'IT +39', value: '+39' },
  { label: 'ES +34', value: '+34' },
  { label: 'NL +31', value: '+31' },
  { label: 'CH +41', value: '+41' },
  { label: 'VU +678', value: '+678' },
];

const NATIONALITY_OPTIONS = [
  'Singapore',
  'Singapore PR',
  'EP',
  'China',
  'Chinese/hongkong sar',
  'South Korea',
  'Japan',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'United States',
  'Canada',
  'Australia',
  'New Zealand',
  'United Kingdom',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Netherlands',
  'Switzerland',
  'Vanuatu',
  'Others (please specify)',
] as const;

function isEnglishOnly(s: string) {
  return !/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/.test(s);
}

function normalizePhone(countryCode: string, local: string) {
  const digits = local.replace(/\D/g, '');
  if (!digits) return undefined;
  return `${countryCode}${digits}`;
}

function splitPhone(phone: string | undefined) {
  const s = String(phone ?? '').trim();
  if (!s.startsWith('+')) return { code: '+65', local: s.replace(/\D/g, '') };
  const codes = [...new Set(PHONE_COUNTRY_CODES.map((c) => c.value))].sort((a, b) => b.length - a.length);
  const hit = codes.find((c) => s.startsWith(c));
  if (!hit) return { code: '+65', local: s.replace(/\D/g, '') };
  return { code: hit, local: s.slice(hit.length).replace(/\D/g, '') };
}

function titleCaseWords(input: string) {
  const s = input.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => {
      const lower = w.toLowerCase();
      const m = lower.match(/^([a-z])([\s\S]*)$/);
      if (!m) return lower;
      return m[1].toUpperCase() + m[2];
    })
    .join(' ');
}

export default function MembersClient() {
  const { t } = useI18n();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [idTypeFilter, setIdTypeFilter] = usePersistedState(
    'gos.secretary.members.idTypeFilter',
    'ALL' as 'ALL' | 'NRIC' | 'FIN' | 'PASSPORT' | 'IC' | 'OTHER' | 'MISSING',
  );
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = usePersistedState('gos.secretary.members.page', 1);
  const [pageSize, setPageSize] = usePersistedState('gos.secretary.members.pageSize', 20);
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phoneCountryCode: '+65',
    phoneLocal: '',
    idType: 'NRIC' as 'NRIC' | 'FIN' | 'PASSPORT' | 'IC' | 'OTHER',
    idNo: '',
    nationality: 'Singapore',
    nationalityOther: '',
    dob: '',
    address: '',
  });

  const normalizeCarToSar = (v: string) => v.replace(/\bcar\b/gi, 'sar');

  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phoneCountryCode: '+65',
    phoneLocal: '',
    idType: 'NRIC' as 'NRIC' | 'FIN' | 'PASSPORT' | 'IC' | 'OTHER',
    idNo: '',
    nationality: 'Singapore',
    nationalityOther: '',
    dob: '',
    address: '',
  });

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
    const hit = (p: Member) => {
      if (idTypeFilter !== 'ALL') {
        const v = String(p.idType ?? '').trim().toUpperCase();
        if (idTypeFilter === 'MISSING') {
          if (v) return false;
        } else {
          if (v !== idTypeFilter) return false;
        }
      }
      if (!q) return true;
      const hay = [p.fullName, p.email ?? '', p.phone ?? '', p.idNo ?? '', p.idType ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    };
    return members.filter(hit);
  }, [members, search, idTypeFilter]);

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
    const fullName = titleCaseWords(form.fullName);
    if (!fullName) {
      setError('INVALID_INPUT');
      return;
    }

    const nationalitySelected = String(form.nationality ?? '').trim();
    const nationality =
      nationalitySelected === 'Others (please specify)'
        ? form.nationalityOther.trim()
        : nationalitySelected;
    if (nationalitySelected === 'Others (please specify)' && !nationality) {
      setError('INVALID_INPUT');
      return;
    }
    if (nationality && !isEnglishOnly(nationality)) {
      setError('ENGLISH_ONLY');
      return;
    }

    const phone = normalizePhone(form.phoneCountryCode, form.phoneLocal);
    if (phone && !/^\+\d{6,15}$/.test(phone)) {
      setError('INVALID_PHONE');
      return;
    }

    const dob = form.dob.trim() || undefined;
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setError('INVALID_DOB');
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
          phone,
          idType: form.idType,
          idNo: form.idNo.trim() || undefined,
          nationality: nationality ? normalizeCarToSar(nationality) : undefined,
          dob,
          address: form.address.trim() || undefined,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setShowAdd(false);
      setForm({
        fullName: '',
        email: '',
        phoneCountryCode: '+65',
        phoneLocal: '',
        idType: 'NRIC',
        idNo: '',
        nationality: 'Singapore',
        nationalityOther: '',
        dob: '',
        address: '',
      });
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function fillMissing(memberId: string) {
    setError(null);
    const ok = window.confirm('Fill missing member info for this row?');
    if (!ok) return;
    const fullName = window.prompt('Name', 'Wai Kwok Fung');
    if (fullName === null) return;
    const email = window.prompt('Email', 'kfwai123@gmail.com');
    if (email === null) return;
    const phone = window.prompt('Phone', '+85269761883');
    if (phone === null) return;
    const idNo = window.prompt('ID', 'HJ2089994');
    if (idNo === null) return;

    const patch = {
      fullName: fullName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      idNo: idNo.trim() || undefined,
    };
    if (!patch.fullName) {
      setError('INVALID_INPUT');
      return;
    }
    if (patch.phone && !/^\+\d{6,15}$/.test(patch.phone)) {
      setError('INVALID_PHONE');
      return;
    }

    const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    ).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    await refresh();
  }

  function openEdit(memberId: string) {
    const m = members.find((x) => x.id === memberId);
    if (!m) return;
    const { code, local } = splitPhone(m.phone);
    const nat = (m.nationality ?? '').trim();
    const inList = (NATIONALITY_OPTIONS as readonly string[]).includes(nat);
    const nationality = nat ? (inList ? nat : 'Others (please specify)') : 'Singapore';
    setEditForm({
      fullName: m.fullName ?? '',
      email: m.email ?? '',
      phoneCountryCode: code,
      phoneLocal: local,
      idType:
        (m as { idType?: unknown }).idType === 'PASSPORT' ||
        (m as { idType?: unknown }).idType === 'FIN' ||
        (m as { idType?: unknown }).idType === 'IC' ||
        (m as { idType?: unknown }).idType === 'OTHER'
          ? ((m as { idType?: any }).idType as any)
          : 'NRIC',
      idNo: m.idNo ?? '',
      nationality,
      nationalityOther: nationality === 'Others (please specify)' ? nat : '',
      dob: m.dob ?? '',
      address: m.address ?? '',
    });
    setPasswordForm({ newPassword: '', confirmPassword: '' });
    setPasswordError(null);
    setPasswordOk(null);
    setEditingMemberId(memberId);
  }

  async function changeMemberPassword() {
    if (!editingMemberId) return;
    const m = members.find((x) => x.id === editingMemberId);
    if (!m?.lastLoginDate) return;

    setPasswordError(null);
    setPasswordOk(null);
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();
    if (newPassword.length < 6) {
      setPasswordError('INVALID_PASSWORD');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('PASSWORD_MISMATCH');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch(`/api/secretary/members/${encodeURIComponent(editingMemberId)}/password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res?.ok || !j?.ok) {
        setPasswordError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setPasswordOk('Password updated');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function saveEdit() {
    if (!editingMemberId) return;
    setError(null);
    const fullName = titleCaseWords(editForm.fullName);
    if (!fullName) {
      setError('INVALID_INPUT');
      return;
    }
    const nationalitySelected = String(editForm.nationality ?? '').trim();
    const nationalityRaw =
      nationalitySelected === 'Others (please specify)'
        ? editForm.nationalityOther.trim()
        : nationalitySelected;
    if (nationalitySelected === 'Others (please specify)' && !nationalityRaw) {
      setError('INVALID_INPUT');
      return;
    }
    if (nationalityRaw && !isEnglishOnly(nationalityRaw)) {
      setError('ENGLISH_ONLY');
      return;
    }
    const phone = normalizePhone(editForm.phoneCountryCode, editForm.phoneLocal);
    if (phone && !/^\+\d{6,15}$/.test(phone)) {
      setError('INVALID_PHONE');
      return;
    }
    const dob = editForm.dob.trim();
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setError('INVALID_DOB');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(editingMemberId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: editForm.email.trim(),
          phone: phone ?? '',
          idType: editForm.idType,
          idNo: editForm.idNo.trim(),
          nationality: nationalityRaw ? normalizeCarToSar(nationalityRaw) : '',
          dob,
          address: editForm.address.trim(),
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setEditingMemberId(null);
      await refresh();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMember(memberId: string) {
    const m = members.find((x) => x.id === memberId);
    const ok = window.confirm(`Delete member${m?.fullName ? `: ${m.fullName}` : ''}?`);
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    await refresh();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xl font-semibold whitespace-nowrap">{t('nav.secretary')}</div>
            <div className="mt-1 text-sm text-black/60">Members</div>
            <div className="mt-3">
              <SecretarySubNavClient active="members" showMembers={true} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
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
            <select
              value={idTypeFilter}
              onChange={(e) => {
                setIdTypeFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-[180px] rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ID type: All</option>
              <option value="NRIC">NRIC</option>
              <option value="FIN">FIN</option>
              <option value="PASSPORT">Passport</option>
              <option value="IC">IC</option>
              <option value="OTHER">Other</option>
              <option value="MISSING">(Missing)</option>
            </select>
          </div>
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
      <MembersTable
        members={visible}
        loading={loading}
        onFillMissing={(id: string) => void fillMissing(id)}
        onEdit={(id: string) => openEdit(id)}
        onDelete={(id: string) => void deleteMember(id)}
      />

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
                  onBlur={() => setForm((v) => ({ ...v, fullName: titleCaseWords(v.fullName) }))}
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
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={form.phoneCountryCode}
                    onChange={(e) => setForm((v) => ({ ...v, phoneCountryCode: e.target.value }))}
                    className="h-10 rounded-lg border border-black/10 bg-white px-2 text-sm text-black/70"
                  >
                    {PHONE_COUNTRY_CODES.map((c) => (
                      <option key={`${c.label}-${c.value}`} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={form.phoneLocal}
                    onChange={(e) => setForm((v) => ({ ...v, phoneLocal: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-black/10 px-3 text-sm"
                    placeholder="Phone number"
                  />
                </div>
              </label>
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">ID</div>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={form.idType}
                    onChange={(e) => setForm((v) => ({ ...v, idType: e.target.value as any }))}
                    className="h-10 rounded-lg border border-black/10 bg-white px-2 text-sm text-black/70"
                  >
                    <option value="PASSPORT">Passport No.</option>
                    <option value="NRIC">NRIC No.</option>
                    <option value="FIN">FIN No.</option>
                    <option value="IC">IC No.</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input
                    value={form.idNo}
                    onChange={(e) => setForm((v) => ({ ...v, idNo: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-black/10 px-3 text-sm"
                    placeholder="ID number"
                  />
                </div>
              </label>
              <label className="text-sm">
                <div className="text-black/60">Nationality</div>
                <select
                  value={form.nationality}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      nationality: e.target.value,
                      nationalityOther: e.target.value === 'Others (please specify)' ? v.nationalityOther : '',
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  {NATIONALITY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <div className="text-black/60">DOB</div>
                <DateInputYMD
                  value={form.dob}
                  onChange={(dob) => setForm((v) => ({ ...v, dob }))}
                  inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
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
              {form.nationality === 'Others (please specify)' ? (
                <label className="text-sm sm:col-span-2">
                  <div className="text-black/60">Other nationality</div>
                  <input
                    value={form.nationalityOther}
                    onChange={(e) => setForm((v) => ({ ...v, nationalityOther: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    placeholder="Please specify in English"
                  />
                </label>
              ) : null}
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

      {editingMemberId ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Edit Member</div>
              <button onClick={() => setEditingMemberId(null)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">Name</div>
                <input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((v) => ({ ...v, fullName: e.target.value }))}
                  onBlur={() => setEditForm((v) => ({ ...v, fullName: titleCaseWords(v.fullName) }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="Full name"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/60">Email</div>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((v) => ({ ...v, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="email@example.com"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/60">Phone</div>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={editForm.phoneCountryCode}
                    onChange={(e) => setEditForm((v) => ({ ...v, phoneCountryCode: e.target.value }))}
                    className="h-10 rounded-lg border border-black/10 bg-white px-2 text-sm text-black/70"
                  >
                    {PHONE_COUNTRY_CODES.map((c) => (
                      <option key={`${c.label}-${c.value}`} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editForm.phoneLocal}
                    onChange={(e) => setEditForm((v) => ({ ...v, phoneLocal: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-black/10 px-3 text-sm"
                    placeholder="Phone number"
                  />
                </div>
              </label>
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">ID</div>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={editForm.idType}
                    onChange={(e) => setEditForm((v) => ({ ...v, idType: e.target.value as any }))}
                    className="h-10 rounded-lg border border-black/10 bg-white px-2 text-sm text-black/70"
                  >
                    <option value="PASSPORT">Passport No.</option>
                    <option value="NRIC">NRIC No.</option>
                    <option value="FIN">FIN No.</option>
                    <option value="IC">IC No.</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input
                    value={editForm.idNo}
                    onChange={(e) => setEditForm((v) => ({ ...v, idNo: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-black/10 px-3 text-sm"
                    placeholder="ID number"
                  />
                </div>
              </label>
              <label className="text-sm">
                <div className="text-black/60">Nationality</div>
                <select
                  value={editForm.nationality}
                  onChange={(e) =>
                    setEditForm((v) => ({
                      ...v,
                      nationality: e.target.value,
                      nationalityOther: e.target.value === 'Others (please specify)' ? v.nationalityOther : '',
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  {NATIONALITY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <div className="text-black/60">DOB</div>
                <DateInputYMD
                  value={editForm.dob}
                  onChange={(dob) => setEditForm((v) => ({ ...v, dob }))}
                  inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <div className="text-black/60">Address</div>
                <input
                  value={editForm.address}
                  onChange={(e) => setEditForm((v) => ({ ...v, address: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  placeholder="Address"
                />
              </label>
              {editForm.nationality === 'Others (please specify)' ? (
                <label className="text-sm sm:col-span-2">
                  <div className="text-black/60">Other nationality</div>
                  <input
                    value={editForm.nationalityOther}
                    onChange={(e) => setEditForm((v) => ({ ...v, nationalityOther: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    placeholder="Please specify in English"
                  />
                </label>
              ) : null}
            </div>

            {(() => {
              const m = members.find((x) => x.id === editingMemberId);
              if (!m?.lastLoginDate) return null;
              return (
                <div className="mt-6 rounded-xl border border-black/10 p-4">
                  <div className="text-sm font-semibold">Login password</div>
                  <div className="mt-1 text-xs text-black/50">Member has logged in before. You can update the login password here.</div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                      <div className="text-black/60">New password</div>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((v) => ({ ...v, newPassword: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        placeholder="At least 6 characters"
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-black/60">Confirm password</div>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((v) => ({ ...v, confirmPassword: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        placeholder="Repeat"
                      />
                    </label>
                  </div>

                  {passwordError ? <div className="mt-2 text-sm text-red-600">{passwordError}</div> : null}
                  {passwordOk ? <div className="mt-2 text-sm text-[#16a34a]">{passwordOk}</div> : null}

                  <div className="mt-3 flex items-center justify-end">
                    <button
                      disabled={passwordSaving}
                      onClick={() => void changeMemberPassword()}
                      className="rounded-lg bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                    >
                      {passwordSaving ? 'Updating...' : 'Update password'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setEditingMemberId(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                disabled={savingEdit}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
