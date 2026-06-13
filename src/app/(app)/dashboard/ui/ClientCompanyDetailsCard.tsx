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
  entityStatus?: string;
  paidUpCapitalCurrency?: string;
  paidUpCapitalAmount?: number;
  totalShares?: number;
  ssicPrimaryCode?: string;
  ssicSecondaryCode?: string;
};

function formatYmd(v?: string) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 10) : '-';
}

function pickAddress(c: CompanyDetails) {
  const a = String(c.registeredOfficeAddress ?? '').trim() || String(c.address ?? '').trim();
  return a || '-';
}

function formatMoney(currency?: string, amount?: number) {
  const cur = String(currency ?? '').trim();
  if (!cur) return '-';
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return `${cur} -`;
  return `${cur} ${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(v?: number) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  return v.toLocaleString('en-SG');
}

function Row(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 py-3 border-t border-black/5">
      <div className="sm:col-span-4 text-black/50">{props.label}</div>
      <div className="sm:col-span-8 text-black/80 break-words">{props.value}</div>
    </div>
  );
}

export default function ClientCompanyDetailsCard(props: { companies: CompanyLite[]; initialCompanyId?: string }) {
  const selectable = useMemo(() => props.companies, [props.companies]);
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CompanyDetails | null>(null);

  const [ssicPrimaryDesc, setSsicPrimaryDesc] = useState<string>('');
  const [ssicSecondaryDesc, setSsicSecondaryDesc] = useState<string>('');

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

  useEffect(() => {
    const c = details;
    if (!c) return;
    const primary = String(c.ssicPrimaryCode ?? '').trim();
    const secondary = String(c.ssicSecondaryCode ?? '').trim();

    let ignore = false;
    setSsicPrimaryDesc('');
    setSsicSecondaryDesc('');

    if (primary) {
      fetch(`/api/ssic?code=${encodeURIComponent(primary)}`, { cache: 'force-cache' })
        .then((r) => r.json().catch(() => null))
        .then((j: any) => {
          if (ignore) return;
          setSsicPrimaryDesc(String(j?.item?.description ?? '').trim());
        })
        .catch(() => null);
    }
    if (secondary) {
      fetch(`/api/ssic?code=${encodeURIComponent(secondary)}`, { cache: 'force-cache' })
        .then((r) => r.json().catch(() => null))
        .then((j: any) => {
          if (ignore) return;
          setSsicSecondaryDesc(String(j?.item?.description ?? '').trim());
        })
        .catch(() => null);
    }
    return () => {
      ignore = true;
    };
  }, [details?.id, details?.ssicPrimaryCode, details?.ssicSecondaryCode]);

  const c = details;
  const heading = c?.name || (companyId ? 'Company' : 'No company');

  return (
    <div className="rounded-xl bg-white border border-black/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-black/90 truncate">{heading}</div>
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
              {x.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="mt-4 text-xs text-black/50">Loading...</div> : null}

      <div className="mt-4 text-sm">
        <Row label="Company registration no." value={c?.companyRegistrationNo || '-'} />
        <Row label="FYE" value={c?.fye || '-'} />
        <Row label="Entity status" value={c?.entityStatus || '-'} />
        <Row label="Incorporation date" value={formatYmd(c?.incorporationDate)} />
        <Row label="Registered office address" value={c ? pickAddress(c) : '-'} />
        <Row label="Paid-up capital" value={c ? formatMoney(c.paidUpCapitalCurrency, c.paidUpCapitalAmount) : '-'} />
        <Row label="Total shares" value={c ? formatNumber(c.totalShares) : '-'} />
        <Row
          label="SSIC (Primary)"
          value={
            c?.ssicPrimaryCode ? (
              <div>
                <div>{c.ssicPrimaryCode}</div>
                {ssicPrimaryDesc ? <div className="mt-0.5 text-xs text-black/50">{ssicPrimaryDesc}</div> : null}
              </div>
            ) : (
              '-'
            )
          }
        />
        <Row
          label="SSIC (Secondary)"
          value={
            c?.ssicSecondaryCode ? (
              <div>
                <div>{c.ssicSecondaryCode}</div>
                {ssicSecondaryDesc ? <div className="mt-0.5 text-xs text-black/50">{ssicSecondaryDesc}</div> : null}
              </div>
            ) : (
              '-'
            )
          }
        />
      </div>
    </div>
  );
}
