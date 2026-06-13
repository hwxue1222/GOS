'use client';

import { useEffect, useMemo, useState } from 'react';

type CompanyLite = { id: string; code: string; name: string };

type CompanyDetails = {
  id: string;
  code: string;
  name: string;
  companyRegistrationNo?: string;
  countryOfBusinessRegistration?: string;
  incorporationDate?: string;
  fye?: string;
  registeredOfficeAddress?: string;
  address?: string;
  email?: string;
  phone?: string;
};

function formatYmd(v?: string) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 10) : '-';
}

function pickAddress(c: CompanyDetails) {
  const a = String(c.registeredOfficeAddress ?? '').trim() || String(c.address ?? '').trim();
  return a || '-';
}

export default function ClientCompanyDetailsCard(props: { companies: CompanyLite[]; initialCompanyId?: string }) {
  const selectable = useMemo(() => props.companies, [props.companies]);
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CompanyDetails | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('gos.currentCompanyId') ?? '';
    const valid = selectable.some((c) => c.id === stored);
    const next = valid ? stored : props.initialCompanyId ?? selectable[0]?.id ?? '';
    if (next) {
      setCompanyId(next);
      window.localStorage.setItem('gos.currentCompanyId', next);
    }
  }, [props.initialCompanyId, selectable]);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (ignore) return;
        if (!j?.ok || !j?.client) {
          setError(j?.error ?? 'FAILED_TO_LOAD');
          setDetails(null);
          return;
        }
        setDetails(j.client as CompanyDetails);
      })
      .catch(() => {
        if (ignore) return;
        setError('NETWORK');
        setDetails(null);
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [companyId]);

  const c = details;
  const heading = c ? `${c.code || ''} ${c.name || ''}`.trim() : companyId ? 'Company' : 'No company';

  return (
    <div className="rounded-xl bg-white border border-black/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{heading || 'Company'}</div>
          <div className="mt-0.5 text-sm text-black/50">Company details</div>
        </div>
        <select
          value={companyId}
          onChange={(e) => {
            const next = e.target.value;
            setCompanyId(next);
            if (next) window.localStorage.setItem('gos.currentCompanyId', next);
          }}
          disabled={!selectable.length}
          className="w-[260px] truncate rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-60"
        >
          {!selectable.length ? <option value="">No companies</option> : null}
          {selectable.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} {x.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-3">
          <div className="text-black/50">Company registration no.</div>
          <div className="mt-1 text-black/80">{c?.companyRegistrationNo || '-'}</div>
        </div>
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-3">
          <div className="text-black/50">Country of business registration</div>
          <div className="mt-1 text-black/80">{c?.countryOfBusinessRegistration || '-'}</div>
        </div>
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-3">
          <div className="text-black/50">Incorporation date</div>
          <div className="mt-1 text-black/80">{formatYmd(c?.incorporationDate)}</div>
        </div>
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-3">
          <div className="text-black/50">FYE</div>
          <div className="mt-1 text-black/80">{c?.fye || '-'}</div>
        </div>
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-3 sm:col-span-2 lg:col-span-2">
          <div className="text-black/50">Registered address</div>
          <div className="mt-1 text-black/80">{c ? pickAddress(c) : '-'}</div>
        </div>
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-3">
          <div className="text-black/50">Contact</div>
          <div className="mt-1 text-black/80">{c?.email || '-'}{c?.phone ? ` / ${c.phone}` : ''}</div>
        </div>
      </div>

      {loading ? <div className="mt-3 text-xs text-black/50">Loading...</div> : null}
    </div>
  );
}

