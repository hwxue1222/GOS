'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

type PhoneCountryCode = '+65' | '+86' | '+852' | '+886' | '+60' | '+62' | '+66' | '+84' | '+63' | '+81' | '+82' | '+1' | '+44';

const PHONE_COUNTRY_CODES: Array<{ label: string; value: PhoneCountryCode }> = [
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
  { label: 'UK +44', value: '+44' },
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
] as const;

type NewSecretary = {
  fullName: string;
  dob: string;
  dobLocked: boolean;
  nationality: string;
  phoneCountryCode: PhoneCountryCode;
  phoneLocal: string;
  idNo: string;
  idTypeLabel: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.';
  email: string;
  joinDate: string;
  address: string;
  lockedFromMember: boolean;
  declaration: {
    i: boolean;
    ii: boolean;
    iii: boolean;
    iv: boolean;
    v: boolean;
    vi: boolean;
    vii: boolean;
  };
};

function normalizePhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode}${digits}`;
}

function splitPhone(phoneRaw: string): { phoneCountryCode: PhoneCountryCode; phoneLocal: string } {
  const s = String(phoneRaw ?? '').trim();
  const digits = s.replace(/\s+/g, '');
  for (const c of PHONE_COUNTRY_CODES.slice().sort((a, b) => b.value.length - a.value.length)) {
    if (digits.startsWith(c.value)) {
      return { phoneCountryCode: c.value, phoneLocal: digits.slice(c.value.length).replace(/\D/g, '') };
    }
  }
  return { phoneCountryCode: '+65', phoneLocal: digits.replace(/\D/g, '') };
}

function draftKey(companyId: string) {
  return `gos.draft.changeSecretary.${companyId}`;
}

function ymdNDaysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function ymdToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function isYmdWithinPastDays(ymd: string, days: number) {
  const v = String(ymd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const today = ymdToday();
  const min = ymdNDaysAgo(days);
  return v >= min && v <= today;
}

function isYmd(ymd: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? '').trim());
}

function maskWord(w: string) {
  const s = String(w ?? '').trim();
  if (!s) return '';
  if (s.length === 1) return '*';
  return `${s[0]}${'*'.repeat(Math.max(2, s.length - 1))}`;
}

function maskName(name: string) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map(maskWord).join(' ');
}

function maskDob(ymd: string) {
  const v = String(ymd ?? '').trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '*/**/****';
  return `**/**/${m[1]}`;
}

function maskEmail(email: string) {
  const v = String(email ?? '').trim();
  const at = v.indexOf('@');
  if (at <= 0) return '*'.repeat(Math.max(6, v.length));
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const lastDot = domain.lastIndexOf('.');
  const domainName = lastDot > 0 ? domain.slice(0, lastDot) : domain;
  const tld = lastDot > 0 ? domain.slice(lastDot) : '';
  const keepTail = Math.min(4, Math.max(0, local.length - 1));
  const maskedLocal =
    local.length <= 1
      ? '*'
      : `${local[0]}${'*'.repeat(Math.max(2, local.length - 1 - keepTail))}${keepTail ? local.slice(local.length - keepTail) : ''}`;
  const maskedDomain = domainName ? `${domainName[0]}${'*'.repeat(Math.max(2, domainName.length - 1))}` : '*'.repeat(4);
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

function maskPhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return `${countryCode} ****`;
  if (digits.length <= 4) return `${countryCode} ${'*'.repeat(digits.length)}`;
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  return `${countryCode} ${head}${'*'.repeat(Math.max(2, digits.length - 4))}${tail}`;
}

function maskNationality(n: string) {
  const parts = String(n ?? '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts
    .map((p) => {
      if (p.length <= 2) return `${p[0] ?? '*'}${'*'.repeat(2)}`;
      return `${p[0]}${'*'.repeat(Math.max(6, p.length - 1))}`;
    })
    .join(' ');
}

function maskAddress(addr: string) {
  const parts = String(addr ?? '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts
    .map((p) => {
      const s = String(p);
      if (!s) return '';
      return `${s[0]}**`;
    })
    .join(' ');
}

export default function ChangeSecretaryClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const [addSecretaries, setAddSecretaries] = useState<NewSecretary[]>([]);
  const [editing, setEditing] = useState(false);
  const [showErrorsByIdx, setShowErrorsByIdx] = useState<Record<number, boolean>>({});
  const [removeSecretaryRoleId, setRemoveSecretaryRoleId] = useState('');
  const [useByBridgeSecretary, setUseByBridgeSecretary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lookupTimerByIdxRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const lookupSeqByIdxRef = useRef(new Map<number, number>());

  const validateSecretary = (s: NewSecretary) => {
    const fullName = s.fullName.trim();
    const idNo = s.idNo.trim();
    const email = s.email.trim();
    const dob = s.dob.trim();
    const nationality = s.nationality.trim();
    const joinDate = s.joinDate.trim();
    const address = s.address.trim();
    const phone = normalizePhone(s.phoneCountryCode, s.phoneLocal);
    const declarationQualifications = Object.values(s.declaration).some(Boolean);
    const missing = {
      fullName: !fullName,
      idNo: !idNo,
      email: !email,
      dob: !dob,
      nationality: !nationality,
      joinDate: !joinDate,
      address: !address,
      phone: !phone,
      declaration: !declarationQualifications,
    };
    const invalid = {
      joinDate: !!joinDate && !isYmdWithinPastDays(joinDate, 14),
    };
    const ok = !Object.values(missing).some(Boolean);
    return { ok: ok && !Object.values(invalid).some(Boolean), missing, invalid };
  };

  async function lookupMemberByIdNo(idx: number, idNoRaw: string) {
    if (!companyId) return;
    const idNo = String(idNoRaw ?? '').trim();
    if (!idNo) return;

    const seq = (lookupSeqByIdxRef.current.get(idx) ?? 0) + 1;
    lookupSeqByIdxRef.current.set(idx, seq);

    const res = await fetch(`/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}`).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | {
          ok: true;
          person: { fullName?: string; email?: string; phone?: string; nationality?: string; dob?: string; address?: string; idNo?: string };
        }
      | { ok: true; person: null }
      | { ok: false; error?: string }
      | null;

    if ((lookupSeqByIdxRef.current.get(idx) ?? 0) !== seq) return;
    if (!res?.ok || !json || !('ok' in json) || !json.ok) return;
    if (!('person' in json) || !json.person) return;

    const p = json.person;
    const phone = splitPhone(String(p.phone ?? ''));
    const patch: Partial<NewSecretary> = {
      fullName: String(p.fullName ?? '').trim(),
      email: String(p.email ?? '').trim(),
      nationality: String(p.nationality ?? '').trim() || 'Singapore',
      address: String(p.address ?? '').trim(),
      phoneCountryCode: phone.phoneCountryCode,
      phoneLocal: phone.phoneLocal,
      lockedFromMember: true,
    };
    const dob = String(p.dob ?? '').trim();
    if (dob && isYmd(dob)) {
      patch.dob = dob;
      patch.dobLocked = true;
    } else {
      patch.dobLocked = false;
    }
    patchSecretary(idx, patch);
    setShowErrorsByIdx((prev) => ({ ...prev, [idx]: false }));
  }


  useEffect(() => {
    if (!companyId) return;
    const raw = window.localStorage.getItem(draftKey(companyId));
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as {
        removeSecretaryRoleId?: string;
        useByBridgeSecretary?: boolean;
        addSecretaries?: NewSecretary[];
      };
      if (typeof d.removeSecretaryRoleId === 'string') setRemoveSecretaryRoleId(d.removeSecretaryRoleId);
      if (typeof d.useByBridgeSecretary === 'boolean') setUseByBridgeSecretary(d.useByBridgeSecretary);
      if (Array.isArray(d.addSecretaries)) setAddSecretaries(d.addSecretaries);
    } catch {
      window.localStorage.removeItem(draftKey(companyId));
    }
  }, [companyId]);

  const existing = useMemo(() => roles?.secretaries ?? [], [roles?.secretaries]);

  function patchSecretary(idx: number, patch: Partial<NewSecretary>) {
    setAddSecretaries((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function addRow() {
    const lastIdx = addSecretaries.length ? addSecretaries.length - 1 : -1;
    if (lastIdx >= 0) {
      const v = validateSecretary(addSecretaries[lastIdx]);
      if (!v.ok) {
        setShowErrorsByIdx((prev) => ({ ...prev, [lastIdx]: true }));
        setSubmitError(`Please complete all required fields for Secretary ${lastIdx + 1} before adding next.`);
        return;
      }
    }

    setEditing(true);
    setSubmitError(null);
    setAddSecretaries((prev) => [
      ...prev,
      {
        fullName: '',
        dob: '',
        dobLocked: false,
        nationality: 'Singapore',
        phoneCountryCode: '+65',
        phoneLocal: '',
        idNo: '',
        idTypeLabel: 'NRIC No.',
        email: '',
        joinDate: '',
        address: '',
        lockedFromMember: false,
        declaration: { i: false, ii: false, iii: false, iv: false, v: false, vi: false, vii: false },
      },
    ]);
  }

  function deleteRow(idx: number) {
    setAddSecretaries((prev) => prev.filter((_, i) => i !== idx));
    setShowErrorsByIdx((prev) => {
      const next: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k);
        if (!Number.isFinite(i) || i === idx) continue;
        next[i > idx ? i - 1 : i] = v;
      }
      return next;
    });
  }

  async function onSave() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    const invalidIdx: number[] = [];
    addSecretaries.forEach((s, idx) => {
      const v = validateSecretary(s);
      if (!v.ok) invalidIdx.push(idx);
    });

    if (invalidIdx.length) {
      setShowErrorsByIdx((prev) => {
        const next = { ...prev };
        for (const idx of invalidIdx) next[idx] = true;
        return next;
      });
      setSubmitError('Please complete all required fields for new secretary.');
      return;
    }

    setSubmitting(true);
    try {
      window.localStorage.setItem(
        draftKey(companyId),
        JSON.stringify({
          removeSecretaryRoleId,
          useByBridgeSecretary,
          addSecretaries,
          savedAt: new Date().toISOString(),
        }),
      );
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function onApply() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    const cleanedAdd = addSecretaries
      .map((x) => ({
        fullName: x.fullName.trim(),
        email: x.email.trim(),
        phone: normalizePhone(x.phoneCountryCode, x.phoneLocal),
        dob: x.dob.trim(),
        nationality: x.nationality.trim(),
        idNo: x.idNo.trim(),
        idTypeLabel: x.idTypeLabel,
        joinDate: x.joinDate.trim(),
        address: x.address.trim(),
        declarationQualifications: (Object.entries(x.declaration)
          .filter(([, v]) => v)
          .map(([k]) => k) as Array<'i' | 'ii' | 'iii' | 'iv' | 'v' | 'vi' | 'vii'>) ?? [],
      }))
      .filter((x) => !!x.fullName);

    const hasDelete = !!removeSecretaryRoleId.trim();
    const hasAdd = cleanedAdd.length > 0;
    if (!useByBridgeSecretary && !hasDelete && !hasAdd) {
      setSubmitError('Please add or delete at least one secretary.');
      return;
    }

    if (hasAdd) {
      for (const s of cleanedAdd) {
        if (!s.fullName || !s.idNo || !s.email || !s.dob || !s.nationality || !s.phone || !s.joinDate || !s.address) {
          setSubmitError('Please complete all required fields for new secretary.');
          return;
        }
        if (!isYmdWithinPastDays(s.joinDate, 14)) {
          setSubmitError('Date of appointment must be within the past 14 days and not in the future.');
          return;
        }
        if (!s.declarationQualifications.length) {
          setSubmitError('Please tick at least one declaration item (i) to (vii).');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'CHANGE_SECRETARY',
          payload: {
            removeSecretaryRoleId: removeSecretaryRoleId.trim() || undefined,
            addSecretaries: cleanedAdd.map((x) => ({
              fullName: x.fullName,
              email: x.email || undefined,
              phone: x.phone || undefined,
              idNo: x.idNo || undefined,
              idTypeLabel: x.idTypeLabel,
              nationality: x.nationality || undefined,
              dob: x.dob || undefined,
              address: x.address || undefined,
              joinDate: x.joinDate || undefined,
              declarationQualifications: x.declarationQualifications,
            })),
            useByBridgeCompanySecretary: useByBridgeSecretary,
          },
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      window.localStorage.removeItem(draftKey(companyId));
      router.push(`/corporate-secretary/applications/company-update/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Change of Secretary" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-black">New secretary appointed</div>
              <button
                type="button"
                onClick={() => {
                  if (!editing && (addSecretaries.length || useByBridgeSecretary)) {
                    setSubmitError(null);
                    setEditing(true);
                    return;
                  }
                  addRow();
                }}
                className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/2"
              >
                Add
              </button>
            </div>

            {!editing && addSecretaries.length ? (
              <div className="mt-2 text-xs text-black/50">
                Saved new secretary: {addSecretaries.map((s) => s.fullName.trim()).filter(Boolean).join(', ') || '-'}
              </div>
            ) : null}

            {!editing && useByBridgeSecretary ? (
              <div className="mt-2 text-xs text-black/50">ByBridge company secretary: Xue Hongwei (NRIC No. S7864540G)</div>
            ) : null}

            {editing ? (
              <div className="mt-4 space-y-6">
                {addSecretaries.map((s, i) => (
                  <div key={i}>
                    {i > 0 ? <div className="my-4 border-t border-dashed border-black/20" /> : null}
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium text-black">Secretary {i + 1}</div>
                      <button
                        type="button"
                        onClick={() => deleteRow(i)}
                        className="rounded-md bg-white border border-red-200 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Full Name
                        </div>
                        <input
                          value={s.lockedFromMember ? maskName(s.fullName) : s.fullName}
                          onChange={(e) => patchSecretary(i, { fullName: e.target.value })}
                          disabled={s.lockedFromMember}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${s.lockedFromMember ? 'bg-black/5 text-black/60' : ''} ${showErrorsByIdx[i] && validateSecretary(s).missing.fullName ? 'border-red-500' : 'border-black/10'}`}
                        />
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Identification
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <select
                            value={s.idTypeLabel}
                            onChange={(e) => patchSecretary(i, { idTypeLabel: e.target.value as NewSecretary['idTypeLabel'] })}
                            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                          >
                            <option value="Passport No.">Passport No.</option>
                            <option value="NRIC No.">NRIC No.</option>
                            <option value="FIN No.">FIN No.</option>
                            <option value="IC No.">IC No.</option>
                          </select>
                          <input
                            value={s.idNo}
                            onChange={(e) => {
                              const next = e.target.value;
                              const wasLocked = s.lockedFromMember;
                              patchSecretary(i, {
                                idNo: next,
                                ...(wasLocked
                                  ? {
                                      lockedFromMember: false,
                                      fullName: '',
                                      email: '',
                                      phoneLocal: '',
                                      dob: '',
                                      dobLocked: false,
                                      nationality: 'Singapore',
                                      address: '',
                                    }
                                  : {}),
                              });
                              const t = lookupTimerByIdxRef.current.get(i);
                              if (t) clearTimeout(t);
                              lookupTimerByIdxRef.current.set(
                                i,
                                setTimeout(() => {
                                  void lookupMemberByIdNo(i, next);
                                }, 350),
                              );
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-sm ${showErrorsByIdx[i] && validateSecretary(s).missing.idNo ? 'border-red-500' : 'border-black/10'}`}
                            placeholder={s.idTypeLabel}
                          />
                        </div>
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Date Of Birth
                        </div>
                        {s.dobLocked ? (
                          <input
                            type="text"
                            value={maskDob(s.dob)}
                            disabled
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-black/5 text-black/60 ${showErrorsByIdx[i] && validateSecretary(s).missing.dob ? 'border-red-500' : 'border-black/10'}`}
                          />
                        ) : (
                          <input
                            type="date"
                            value={s.dob}
                            onChange={(e) => patchSecretary(i, { dob: e.target.value, dobLocked: false })}
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${showErrorsByIdx[i] && validateSecretary(s).missing.dob ? 'border-red-500' : 'border-black/10'}`}
                          />
                        )}
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Email
                        </div>
                        <input
                          value={s.lockedFromMember ? maskEmail(s.email) : s.email}
                          onChange={(e) => patchSecretary(i, { email: e.target.value })}
                          disabled={s.lockedFromMember}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${s.lockedFromMember ? 'bg-black/5 text-black/60' : ''} ${showErrorsByIdx[i] && validateSecretary(s).missing.email ? 'border-red-500' : 'border-black/10'}`}
                        />
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Nationality
                        </div>
                        {s.lockedFromMember ? (
                          <input
                            value={maskNationality(s.nationality)}
                            disabled
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-black/5 text-black/60 ${showErrorsByIdx[i] && validateSecretary(s).missing.nationality ? 'border-red-500' : 'border-black/10'}`}
                          />
                        ) : (
                          <select
                            value={s.nationality}
                            onChange={(e) => patchSecretary(i, { nationality: e.target.value })}
                            className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm ${showErrorsByIdx[i] && validateSecretary(s).missing.nationality ? 'border-red-500' : 'border-black/10'}`}
                          >
                            {NATIONALITY_OPTIONS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Date of appointment
                        </div>
                        <input
                          type="date"
                          value={s.joinDate}
                          onChange={(e) => patchSecretary(i, { joinDate: e.target.value })}
                          min={ymdNDaysAgo(14)}
                          max={ymdToday()}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                            showErrorsByIdx[i] && (validateSecretary(s).missing.joinDate || validateSecretary(s).invalid.joinDate)
                              ? 'border-red-500'
                              : 'border-black/10'
                          }`}
                        />
                        {showErrorsByIdx[i] && validateSecretary(s).invalid.joinDate ? (
                          <div className="mt-1 text-xs text-red-600">Date of appointment must be within the past 14 days and not in the future.</div>
                        ) : null}
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Phone
                        </div>
                        <div
                          className={`mt-1 flex items-center rounded-lg border overflow-hidden ${showErrorsByIdx[i] && validateSecretary(s).missing.phone ? 'border-red-500' : 'border-black/10'}`}
                        >
                          <select
                            value={s.phoneCountryCode}
                            onChange={(e) => patchSecretary(i, { phoneCountryCode: e.target.value as PhoneCountryCode })}
                            disabled={s.lockedFromMember}
                            className={`px-3 py-2 text-sm border-r border-black/10 ${s.lockedFromMember ? 'bg-black/5 text-black/60' : 'bg-white'}`}
                          >
                            {PHONE_COUNTRY_CODES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={s.lockedFromMember ? maskPhone(s.phoneCountryCode, s.phoneLocal) : s.phoneLocal}
                            onChange={(e) => patchSecretary(i, { phoneLocal: e.target.value })}
                            disabled={s.lockedFromMember}
                            className={`flex-1 px-3 py-2 text-sm outline-none ${s.lockedFromMember ? 'bg-black/5 text-black/60' : ''}`}
                            placeholder="Phone"
                          />
                        </div>
                      </label>

                      <label className="sm:col-span-12 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Address
                        </div>
                        {s.lockedFromMember ? (
                          <textarea
                            value={maskAddress(s.address)}
                            disabled
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[90px] bg-black/5 text-black/60 ${showErrorsByIdx[i] && validateSecretary(s).missing.address ? 'border-red-500' : 'border-black/10'}`}
                          />
                        ) : (
                          <textarea
                            value={s.address}
                            onChange={(e) => patchSecretary(i, { address: e.target.value })}
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[90px] ${showErrorsByIdx[i] && validateSecretary(s).missing.address ? 'border-red-500' : 'border-black/10'}`}
                          />
                        )}
                      </label>

                      <div className="sm:col-span-12 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Declaration
                        </div>
                        <div className="mt-2 text-black/70">
                          I am a qualified person under section 171(1AA) of the Companies Act by virtue of my being —
                        </div>
                        <div
                          className={`mt-2 space-y-2 rounded-lg border px-3 py-3 ${showErrorsByIdx[i] && validateSecretary(s).missing.declaration ? 'border-red-500' : 'border-transparent'}`}
                        >
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.i}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, i: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(i) a secretary of a company for at least 3 of the 5 years immediately preceding the abovementioned date of my appointment as secretary of the abovenamed company.</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.ii}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, ii: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(ii) a qualified person under the Legal Profession Act (Cap. 161).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.iii}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, iii: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(iii) public accountant registered or deemed to be registered under the Accountants Act (Cap. 2).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.iv}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, iv: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(iv) a member of the Singapore Association of the Institute of Chartered Secretaries and Administrators.</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.v}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, v: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(v) a member of the Institute of Singapore Chartered Accountants (formerly known as the Institute of Certified Public Accountants of Singapore).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.vi}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, vi: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(vi) a member of the Association of International Accountants (Singapore Branch).</span>
                          </label>
                          <label className="flex items-start gap-2 text-sm text-black/80">
                            <input
                              type="checkbox"
                              checked={s.declaration.vii}
                              onChange={(e) => patchSecretary(i, { declaration: { ...s.declaration, vii: e.target.checked } })}
                              className="mt-1 h-4 w-4"
                            />
                            <span>(vii) a member of The Institute of Company Accountants, Singapore.</span>
                          </label>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="border-t border-black/10" />

          <div>
            <div className="text-sm font-medium text-black">Resignation of secretary</div>
            <select
              value={removeSecretaryRoleId}
              onChange={(e) => setRemoveSecretaryRoleId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value=""></option>
              {existing.map((r) => (
                <option key={r.role.id} value={r.role.id}>
                  {r.entity.person.fullName}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeSecretary}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseByBridgeSecretary(checked);
                setSubmitError(null);
              }}
              className="h-4 w-4"
            />
            To use ByBridge company secretary
          </label>

          <button
            disabled={submitting}
            onClick={() => void (editing ? onSave() : onApply())}
            className="w-full rounded-lg bg-[#2f7bdc] text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            {editing ? 'Save' : 'Apply'}
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
