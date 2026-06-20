'use client';

import { useEffect, useMemo, useRef } from 'react';

import { DateInputYMD } from '@/components/DateInputYMD';
import { maskAddress, maskDob, maskEmail, maskName, maskNationality, maskPhone } from '@/lib/mask';

import { PHONE_COUNTRY_CODES, NATIONALITY_OPTIONS, splitPhone } from '@/app/(app)/secretary/companies/[clientId]/ui/directorChangeFormUtils';

import type { PersonDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';

export default function PersonFields(props: { value: PersonDraft; onChange: (next: PersonDraft) => void; showUnlock?: boolean }) {
  const v = props.value;
  const set = (patch: Partial<PersonDraft>) => props.onChange({ ...v, ...patch });

  const lookupSeqRef = useRef(0);
  const lookupTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
    const idNo = v.idNo.trim();
    if (!idNo || idNo.length < 4) return;
    if (v.lockedFromLookup) return;
    lookupTimerRef.current = window.setTimeout(() => {
      const seq = lookupSeqRef.current + 1;
      lookupSeqRef.current = seq;
      if (pendingRef.current) pendingRef.current.abort();
      pendingRef.current = new AbortController();
      const url = `/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}&idTypeLabel=${encodeURIComponent(v.idTypeLabel)}`;
      fetch(url, { cache: 'no-store', signal: pendingRef.current.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (lookupSeqRef.current !== seq) return;
          const p = (j?.person ?? null) as
            | {
                fullName?: string;
                email?: string;
                phone?: string;
                nationality?: string;
                dob?: string;
                address?: string;
              }
            | null;
          if (!p) return;
          const sp = splitPhone(String(p.phone ?? ''));
          props.onChange({
            ...v,
            fullName: String(p.fullName ?? ''),
            email: String(p.email ?? ''),
            nationality: String(p.nationality ?? ''),
            dob: String(p.dob ?? ''),
            address: String(p.address ?? ''),
            phoneCountryCode: sp.phoneCountryCode,
            phoneLocal: sp.phoneLocal,
            lockedFromLookup: true,
          });
        })
        .catch(() => null);
    }, 500);

    return () => {
      if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
    };
  }, [v.idNo, v.idTypeLabel, v.lockedFromLookup]);

  const disabled = v.lockedFromLookup;
  const shown = useMemo(() => {
    if (!disabled) return null;
    return {
      fullName: maskName(v.fullName),
      email: maskEmail(v.email),
      phone: maskPhone(v.phoneCountryCode, v.phoneLocal),
      nationality: maskNationality(v.nationality),
      dob: maskDob(v.dob),
      address: maskAddress(v.address),
    };
  }, [disabled, v.address, v.dob, v.email, v.fullName, v.nationality, v.phoneCountryCode, v.phoneLocal]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Full Name
        </div>
        <input
          value={disabled && shown ? shown.fullName : v.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
        />
      </label>

      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> {v.idTypeLabel}
        </div>
        <div className="mt-1 flex gap-2">
          <select
            value={v.idTypeLabel}
            onChange={(e) => set({ idTypeLabel: e.target.value as PersonDraft['idTypeLabel'] })}
            disabled={disabled}
            className="w-[140px] rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/5"
          >
            <option value="Passport No.">Passport</option>
            <option value="NRIC No.">NRIC</option>
            <option value="FIN No.">FIN</option>
            <option value="IC No.">IC</option>
          </select>
          <input
            value={v.idNo}
            onChange={(e) => set({ idNo: e.target.value })}
            disabled={disabled}
            className="flex-1 rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
          />
        </div>
      </label>

      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Date Of Birth
        </div>
        <DateInputYMD
          value={disabled && shown ? '' : v.dob}
          onChange={(next) => set({ dob: next })}
          inputClassName="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
          disabled={disabled}
          placeholder={disabled && shown ? shown.dob : 'Date Of Birth'}
        />
      </label>

      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Email
        </div>
        <input
          value={disabled && shown ? shown.email : v.email}
          onChange={(e) => set({ email: e.target.value })}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
        />
      </label>

      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Nationality
        </div>
        <select
          value={v.nationality}
          onChange={(e) => set({ nationality: e.target.value })}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/5"
        >
          <option value="">Select</option>
          {NATIONALITY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Phone
        </div>
        <div className="mt-1 flex gap-2">
          <select
            value={v.phoneCountryCode}
            onChange={(e) => set({ phoneCountryCode: e.target.value as PersonDraft['phoneCountryCode'] })}
            disabled={disabled}
            className="w-[140px] rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/5"
          >
            {PHONE_COUNTRY_CODES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={disabled && shown ? '' : v.phoneLocal}
            onChange={(e) => set({ phoneLocal: e.target.value })}
            disabled={disabled}
            className="flex-1 rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
            placeholder={disabled && shown ? shown.phone : ''}
          />
        </div>
      </label>

      <label className="text-sm sm:col-span-2">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Address
        </div>
        <textarea
          value={disabled && shown ? shown.address : v.address}
          onChange={(e) => set({ address: e.target.value })}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 min-h-[84px] disabled:bg-black/5"
        />
      </label>

      {disabled && props.showUnlock ? (
        <div className="sm:col-span-2">
          <button type="button" onClick={() => set({ lockedFromLookup: false })} className="text-sm text-[#2f7bdc] hover:underline">
            Unlock fields
          </button>
        </div>
      ) : null}
    </div>
  );
}
