'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { maskAddress, maskDob, maskEmail, maskName, maskNationality, maskPhone } from '@/lib/mask';

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

type NewDirector = {
  fullName: string;
  dob: string;
  dobLocked: boolean;
  nationality: string;
  phoneCountryCode: PhoneCountryCode;
  phoneLocal: string;
  idNo: string;
  idTypeLabel: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.';
  email: string;
  appointmentDate: string;
  address: string;
  lockedFromMember: boolean;
};

function draftKey(companyId: string) {
  return `gos.draft.changeDirector.${companyId}`;
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

function isYmd(ymd: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? '').trim());
}

function isYmdWithinPastDays(ymd: string, days: number) {
  const v = String(ymd ?? '').trim();
  if (!isYmd(v)) return false;
  const today = ymdToday();
  const min = ymdNDaysAgo(days);
  return v >= min && v <= today;
}

function normalizePhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode}${digits}`;
}

function splitPhone(phoneRaw: string): { phoneCountryCode: PhoneCountryCode; phoneLocal: string } {
  const s = String(phoneRaw ?? '').trim().replace(/\s+/g, '');
  for (const c of PHONE_COUNTRY_CODES.slice().sort((a, b) => b.value.length - a.value.length)) {
    if (s.startsWith(c.value)) {
      return { phoneCountryCode: c.value, phoneLocal: s.slice(c.value.length).replace(/\D/g, '') };
    }
  }
  return { phoneCountryCode: '+65', phoneLocal: s.replace(/\D/g, '') };
}

export default function ChangeDirectorClient(props: {
  companyId: string;
  closeHref: string;
  directors: Array<{ roleId: string; fullName: string }>;
}) {
  const router = useRouter();
  const { companyId, closeHref, directors } = props;

  const [editing, setEditing] = useState(false);
  const [removeDirectorRoleId, setRemoveDirectorRoleId] = useState('');
  const [useByBridgeNomineeDirector, setUseByBridgeNomineeDirector] = useState(false);
  const [addDirectors, setAddDirectors] = useState<NewDirector[]>([]);
  const [showErrorsByIdx, setShowErrorsByIdx] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lookupTimerByIdx = useMemo(() => new Map<number, ReturnType<typeof setTimeout>>(), []);
  const lookupSeqByIdx = useMemo(() => new Map<number, number>(), []);

  useEffect(() => {
    const raw = window.localStorage.getItem(draftKey(companyId));
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as {
        removeDirectorRoleId?: string;
        useByBridgeNomineeDirector?: boolean;
        addDirectors?: NewDirector[];
      };
      if (typeof d.removeDirectorRoleId === 'string') setRemoveDirectorRoleId(d.removeDirectorRoleId);
      if (typeof d.useByBridgeNomineeDirector === 'boolean') setUseByBridgeNomineeDirector(d.useByBridgeNomineeDirector);
      if (Array.isArray(d.addDirectors)) setAddDirectors(d.addDirectors);
    } catch {
      window.localStorage.removeItem(draftKey(companyId));
    }
  }, [companyId]);

  const validateDirector = (d: NewDirector) => {
    const missing = {
      fullName: !d.fullName.trim(),
      idNo: !d.idNo.trim(),
      email: !d.email.trim(),
      dob: !d.dob.trim(),
      nationality: !d.nationality.trim(),
      appointmentDate: !d.appointmentDate.trim(),
      address: !d.address.trim(),
      phone: !normalizePhone(d.phoneCountryCode, d.phoneLocal),
    };
    const invalid = {
      appointmentDate: !!d.appointmentDate.trim() && !isYmdWithinPastDays(d.appointmentDate.trim(), 14),
      dob: !!d.dob.trim() && !isYmd(d.dob.trim()),
    };
    const ok = !Object.values(missing).some(Boolean) && !Object.values(invalid).some(Boolean);
    return { ok, missing, invalid };
  };

  function patchDirector(idx: number, patch: Partial<NewDirector>) {
    setAddDirectors((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function lookupMemberByIdNo(idx: number, idNoRaw: string) {
    const idNo = String(idNoRaw ?? '').trim();
    if (!idNo) return;

    const seq = (lookupSeqByIdx.get(idx) ?? 0) + 1;
    lookupSeqByIdx.set(idx, seq);

    const res = await fetch(`/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}`).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | {
          ok: true;
          person: { fullName?: string; email?: string; phone?: string; nationality?: string; dob?: string; address?: string };
        }
      | { ok: true; person: null }
      | { ok: false; error?: string }
      | null;

    if ((lookupSeqByIdx.get(idx) ?? 0) !== seq) return;
    if (!res?.ok || !json || !('ok' in json) || !json.ok) return;
    if (!('person' in json) || !json.person) return;

    const p = json.person;
    const phone = splitPhone(String(p.phone ?? ''));
    const patch: Partial<NewDirector> = {
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
    }
    patchDirector(idx, patch);
    setShowErrorsByIdx((prev) => ({ ...prev, [idx]: false }));
  }

  function deleteRow(idx: number) {
    setAddDirectors((prev) => prev.filter((_, i) => i !== idx));
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

  function addRow() {
    const lastIdx = addDirectors.length ? addDirectors.length - 1 : -1;
    if (lastIdx >= 0) {
      const v = validateDirector(addDirectors[lastIdx]);
      if (!v.ok) {
        setShowErrorsByIdx((prev) => ({ ...prev, [lastIdx]: true }));
        setSubmitError(`Please complete all required fields for Director ${lastIdx + 1} before adding next.`);
        return;
      }
    }

    setEditing(true);
    setSubmitError(null);
    setAddDirectors((prev) => [
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
        appointmentDate: '',
        address: '',
        lockedFromMember: false,
      },
    ]);
  }

  async function onSave() {
    setSubmitError(null);

    const invalidIdx: number[] = [];
    addDirectors.forEach((d, idx) => {
      const v = validateDirector(d);
      if (!v.ok) invalidIdx.push(idx);
    });

    if (invalidIdx.length) {
      setShowErrorsByIdx((prev) => {
        const next = { ...prev };
        for (const idx of invalidIdx) next[idx] = true;
        return next;
      });
      setSubmitError('Please complete all required fields for new director.');
      return;
    }

    window.localStorage.setItem(
      draftKey(companyId),
      JSON.stringify({ removeDirectorRoleId, useByBridgeNomineeDirector, addDirectors, savedAt: new Date().toISOString() }),
    );
    setEditing(false);
  }

  async function onApply() {
    setSubmitError(null);

    const cleanedAdd = addDirectors
      .map((d) => ({
        fullName: d.fullName.trim(),
        email: d.email.trim(),
        phone: normalizePhone(d.phoneCountryCode, d.phoneLocal),
        dob: d.dob.trim(),
        nationality: d.nationality.trim(),
        idNo: d.idNo.trim(),
        idTypeLabel: d.idTypeLabel,
        appointmentDate: d.appointmentDate.trim(),
        address: d.address.trim(),
      }))
      .filter((d) => !!d.fullName);

    const hasDelete = !!removeDirectorRoleId.trim();
    const hasAdd = cleanedAdd.length > 0;
    if (!useByBridgeNomineeDirector && !hasDelete && !hasAdd) {
      setSubmitError('Please add or resign at least one director.');
      return;
    }

    if (hasAdd) {
      for (const d of cleanedAdd) {
        if (!d.fullName || !d.email || !d.idNo || !d.nationality || !d.dob || !d.address || !d.phone || !d.appointmentDate) {
          setSubmitError('Please complete all required fields for new director.');
          return;
        }
        if (!isYmd(d.dob)) {
          setSubmitError('Date of birth must be a valid date.');
          return;
        }
        if (!isYmdWithinPastDays(d.appointmentDate, 14)) {
          setSubmitError('Date of appointment must be within the past 14 days and not in the future.');
          return;
        }
      }
      const apptSet = new Set(cleanedAdd.map((d) => d.appointmentDate));
      if (apptSet.size > 1) {
        setSubmitError('All new directors must share the same Date of appointment.');
        return;
      }
    }

    const effectiveDate = hasAdd ? cleanedAdd[0]!.appointmentDate : ymdToday();

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/director-change-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          effectiveDate,
          useByBridgeNomineeDirector,
          removeDirectorRoleIds: removeDirectorRoleId ? [removeDirectorRoleId] : [],
          addDirectors: cleanedAdd.map((d) => ({
            fullName: d.fullName,
            email: d.email,
            idTypeLabel: d.idTypeLabel,
            idNo: d.idNo,
            nationality: d.nationality,
            dob: d.dob,
            address: d.address,
            phone: d.phone,
          })),
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      window.localStorage.removeItem(draftKey(companyId));
      router.push(`/corporate-secretary/applications/director-change/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Change of Director" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      <div className="space-y-5">
        <div className="border-b border-black/5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-black">New director appointed</div>
            <button
              type="button"
              onClick={() => {
                if (!editing && addDirectors.length) {
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

          {!editing && addDirectors.length ? (
            <div className="mt-2 text-xs text-black/50">Saved new director: {addDirectors.map((d) => d.fullName.trim()).filter(Boolean).join(', ') || '-'}</div>
          ) : null}

          {editing ? (
            <div className="mt-4 space-y-6">
              {addDirectors.map((d, i) => {
                const v = validateDirector(d);
                const showErr = !!showErrorsByIdx[i];
                const locked = d.lockedFromMember;
                return (
                  <div key={i}>
                    {i > 0 ? <div className="my-4 border-t border-dashed border-black/20" /> : null}
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-black">Director {i + 1}</div>
                      <button
                        type="button"
                        onClick={() => deleteRow(i)}
                        className="rounded-md bg-white border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-4">
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Full Name
                        </div>
                        <input
                          value={locked ? maskName(d.fullName) : d.fullName}
                          onChange={(e) => patchDirector(i, { fullName: e.target.value })}
                          disabled={locked}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${locked ? 'bg-black/5 text-black/60' : ''} ${showErr && v.missing.fullName ? 'border-red-500' : 'border-black/10'}`}
                        />
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Identification
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <select
                            value={d.idTypeLabel}
                            onChange={(e) => patchDirector(i, { idTypeLabel: e.target.value as NewDirector['idTypeLabel'] })}
                            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                          >
                            <option value="Passport No.">Passport No.</option>
                            <option value="NRIC No.">NRIC No.</option>
                            <option value="FIN No.">FIN No.</option>
                            <option value="IC No.">IC No.</option>
                          </select>
                          <input
                            value={d.idNo}
                            onChange={(e) => {
                              const next = e.target.value;
                              const wasLocked = d.lockedFromMember;
                              patchDirector(i, {
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
                              const t = lookupTimerByIdx.get(i);
                              if (t) clearTimeout(t);
                              lookupTimerByIdx.set(
                                i,
                                setTimeout(() => {
                                  void lookupMemberByIdNo(i, next);
                                }, 350),
                              );
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-sm ${showErr && v.missing.idNo ? 'border-red-500' : 'border-black/10'}`}
                            placeholder={d.idTypeLabel}
                          />
                        </div>
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Date Of Birth
                        </div>
                        {d.dobLocked ? (
                          <input
                            type="text"
                            value={maskDob(d.dob)}
                            disabled
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-black/5 text-black/60 ${showErr && v.missing.dob ? 'border-red-500' : 'border-black/10'}`}
                          />
                        ) : (
                          <input
                            type="date"
                            value={d.dob}
                            onChange={(e) => patchDirector(i, { dob: e.target.value, dobLocked: false })}
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${showErr && (v.missing.dob || v.invalid.dob) ? 'border-red-500' : 'border-black/10'}`}
                          />
                        )}
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Email
                        </div>
                        <input
                          value={locked ? maskEmail(d.email) : d.email}
                          onChange={(e) => patchDirector(i, { email: e.target.value })}
                          disabled={locked}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${locked ? 'bg-black/5 text-black/60' : ''} ${showErr && v.missing.email ? 'border-red-500' : 'border-black/10'}`}
                        />
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Nationality
                        </div>
                        {locked ? (
                          <input
                            value={maskNationality(d.nationality)}
                            disabled
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-black/5 text-black/60 ${showErr && v.missing.nationality ? 'border-red-500' : 'border-black/10'}`}
                          />
                        ) : (
                          <input
                            value={d.nationality}
                            onChange={(e) => patchDirector(i, { nationality: e.target.value })}
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${showErr && v.missing.nationality ? 'border-red-500' : 'border-black/10'}`}
                          />
                        )}
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Date of appointment
                        </div>
                        <input
                          type="date"
                          value={d.appointmentDate}
                          onChange={(e) => patchDirector(i, { appointmentDate: e.target.value })}
                          min={ymdNDaysAgo(14)}
                          max={ymdToday()}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${showErr && (v.missing.appointmentDate || v.invalid.appointmentDate) ? 'border-red-500' : 'border-black/10'}`}
                        />
                        {showErr && v.invalid.appointmentDate ? (
                          <div className="mt-1 text-xs text-red-600">Date of appointment must be within the past 14 days and not in the future.</div>
                        ) : null}
                      </label>

                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Phone
                        </div>
                        <div className={`mt-1 flex items-center rounded-lg border overflow-hidden ${showErr && v.missing.phone ? 'border-red-500' : 'border-black/10'}`}>
                          <select
                            value={d.phoneCountryCode}
                            onChange={(e) => patchDirector(i, { phoneCountryCode: e.target.value as PhoneCountryCode })}
                            disabled={locked}
                            className={`px-3 py-2 text-sm border-r border-black/10 ${locked ? 'bg-black/5 text-black/60' : 'bg-white'}`}
                          >
                            {PHONE_COUNTRY_CODES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={locked ? maskPhone(d.phoneCountryCode, d.phoneLocal) : d.phoneLocal}
                            onChange={(e) => patchDirector(i, { phoneLocal: e.target.value })}
                            disabled={locked}
                            className={`flex-1 px-3 py-2 text-sm outline-none ${locked ? 'bg-black/5 text-black/60' : ''}`}
                            placeholder="Phone"
                          />
                        </div>
                      </label>

                      <label className="sm:col-span-12 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Residential address
                        </div>
                        {locked ? (
                          <textarea
                            value={maskAddress(d.address)}
                            disabled
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[90px] bg-black/5 text-black/60 ${showErr && v.missing.address ? 'border-red-500' : 'border-black/10'}`}
                          />
                        ) : (
                          <textarea
                            value={d.address}
                            onChange={(e) => patchDirector(i, { address: e.target.value })}
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[90px] ${showErr && v.missing.address ? 'border-red-500' : 'border-black/10'}`}
                          />
                        )}
                      </label>
                    </div>
                  </div>
                );
              })}

              <button
                disabled={submitting}
                onClick={() => void onSave()}
                className="w-full rounded-lg bg-[#2f7bdc] text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
              >
                Save
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-sm text-black">Resignation of director</div>
          <select
            value={removeDirectorRoleId}
            onChange={(e) => setRemoveDirectorRoleId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value=""></option>
            {directors.map((d) => (
              <option key={d.roleId} value={d.roleId}>
                {d.fullName}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-black/80">
          <input
            type="checkbox"
            checked={useByBridgeNomineeDirector}
            onChange={(e) => {
              setUseByBridgeNomineeDirector(e.target.checked);
              setSubmitError(null);
            }}
            className="h-4 w-4"
          />
          To use ByBridge nominee director service
        </label>

        {!editing ? (
          <button
            disabled={submitting}
            onClick={() => void onApply()}
            className="w-full rounded-lg bg-[#2f7bdc] text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            Apply
          </button>
        ) : null}
      </div>
    </ModalShell>
  );
}

