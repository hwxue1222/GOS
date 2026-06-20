'use client';

import { useEffect, useRef } from 'react';

import CountryOfIncorporationSelect from '@/components/CountryOfIncorporationSelect';

import type { CompanyDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';

export default function CompanyFields(props: { value: CompanyDraft; onChange: (next: CompanyDraft) => void; hidePhone?: boolean }) {
  const v = props.value;
  const set = (patch: Partial<CompanyDraft>) => props.onChange({ ...v, ...patch });

  const lookupSeqRef = useRef(0);
  const lookupTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
    const regNo = v.registrationNo.trim();
    if (!regNo || regNo.length < 4) return;
    if (v.lockedFromLookup) return;
    lookupTimerRef.current = window.setTimeout(() => {
      const seq = lookupSeqRef.current + 1;
      lookupSeqRef.current = seq;
      if (pendingRef.current) pendingRef.current.abort();
      pendingRef.current = new AbortController();
      fetch(`/api/portal/company-lookup?registrationNo=${encodeURIComponent(regNo)}`, { cache: 'no-store', signal: pendingRef.current.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (lookupSeqRef.current !== seq) return;
          const c = (j?.company ?? null) as
            | {
                clientId?: string;
                name?: string;
                companyRegistrationNo?: string;
                countryOfIncorporation?: string;
                address?: string;
                email?: string;
                phone?: string;
              }
            | null;
          if (!c) return;
          props.onChange({
            ...v,
            companyName: String(c.name ?? ''),
            registrationNo: String(c.companyRegistrationNo ?? regNo),
            countryOfIncorporation: String(c.countryOfIncorporation ?? ''),
            address: String(c.address ?? ''),
            email: String(c.email ?? ''),
            phone: String(c.phone ?? ''),
            clientId: c.clientId ? String(c.clientId) : undefined,
            lockedFromLookup: true,
          });
        })
        .catch(() => null);
    }, 500);
    return () => {
      if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
    };
  }, [v.lockedFromLookup, v.registrationNo]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Company Name
        </div>
        <input
          value={v.companyName}
          onChange={(e) => set({ companyName: e.target.value })}
          disabled={v.lockedFromLookup}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
        />
      </label>
      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Registration No.
        </div>
        <input
          value={v.registrationNo}
          onChange={(e) => set({ registrationNo: e.target.value })}
          disabled={v.lockedFromLookup}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
        />
      </label>
      <label className="text-sm">
        <div className="text-black/60">Country Of Incorporation</div>
        <div className="mt-1">
          <CountryOfIncorporationSelect
            value={v.countryOfIncorporation}
            onChange={(next) => set({ countryOfIncorporation: next })}
            disabled={v.lockedFromLookup}
            placeholder="Select"
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/5"
          />
        </div>
      </label>
      <label className="text-sm">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Email
        </div>
        <input
          value={v.email}
          onChange={(e) => set({ email: e.target.value })}
          disabled={v.lockedFromLookup}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <div className="text-black/60">
          <span className="text-red-600">*</span> Address
        </div>
        <textarea
          value={v.address}
          onChange={(e) => set({ address: e.target.value })}
          disabled={v.lockedFromLookup}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 min-h-[84px] disabled:bg-black/5"
        />
      </label>
      {props.hidePhone ? null : (
        <label className="text-sm sm:col-span-2">
          <div className="text-black/60">Phone</div>
          <input
            value={v.phone}
            onChange={(e) => set({ phone: e.target.value })}
            disabled={v.lockedFromLookup}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 disabled:bg-black/5"
          />
        </label>
      )}
    </div>
  );
}
