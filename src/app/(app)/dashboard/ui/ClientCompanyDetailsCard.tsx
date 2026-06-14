'use client';

import { useEffect, useMemo, useState } from 'react';

type CompanyLite = { id: string; code: string; name: string };

type CompanyDetails = {
  id: string;
  code: string;
  name: string;
  companyRegistrationNo?: string;
  countryOfIncorporation?: string;
  incorporationDate?: string;
  fye?: string;
  latestAgmDate?: string;
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

type CompanyRoles = {
  directors: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: { fullName: string } } }>;
  shareholders: Array<
    | { role: { id: string; shares?: number }; entity: { type: 'PERSON'; person: { fullName: string } } }
    | { role: { id: string; shares?: number }; entity: { type: 'COMPANY'; company: { name: string } } }
  >;
  rorc: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: { fullName: string } } | { type: 'COMPANY'; company: { name: string } } }>;
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
  const [roles, setRoles] = useState<CompanyRoles | null>(null);

  const [expanded, setExpanded] = useState(false);

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
    function syncFromStorage() {
      const stored = window.localStorage.getItem('gos.currentCompanyId') ?? '';
      if (!stored) return;
      if (!selectable.some((c) => c.id === stored)) return;
      setCompanyId(stored);
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== 'gos.currentCompanyId') return;
      syncFromStorage();
    }
    function onCompanyChanged() {
      syncFromStorage();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('gos.companyChanged', onCompanyChanged as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('gos.companyChanged', onCompanyChanged as EventListener);
    };
  }, [selectable]);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    setExpanded(false);
    fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (ignore) return;
        if (!j?.ok || !j?.client) {
          setError(j?.error ?? 'FAILED_TO_LOAD');
          setDetails(null);
          setRoles(null);
          return;
        }
        setDetails(j.client as CompanyDetails);
        setRoles((j.roles ?? null) as CompanyRoles | null);
      })
      .catch(() => {
        if (ignore) return;
        setError('NETWORK');
        setDetails(null);
        setRoles(null);
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

  const directorsText = useMemo(() => {
    const list = roles?.directors ?? [];
    const names = list.map((d) => d.entity.person.fullName).filter(Boolean);
    return names.length ? names.join(', ') : '-';
  }, [roles?.directors]);

  const shareholdersText = useMemo(() => {
    const list = (roles?.shareholders ?? []) as Array<any>;
    const parts = list
      .map((s) => {
        const name = s?.entity?.type === 'PERSON' ? s.entity.person.fullName : s?.entity?.type === 'COMPANY' ? s.entity.company.name : '';
        const shares = typeof s?.role?.shares === 'number' ? s.role.shares : undefined;
        if (!name) return '';
        return typeof shares === 'number' ? `${name} (${shares.toLocaleString()})` : name;
      })
      .filter(Boolean);
    return parts.length ? parts.join(', ') : '-';
  }, [roles?.shareholders]);

  const rorcText = useMemo(() => {
    const list = (roles?.rorc ?? []) as Array<any>;
    const names = list
      .map((r) => (r?.entity?.type === 'PERSON' ? r.entity.person.fullName : r?.entity?.type === 'COMPANY' ? r.entity.company.name : ''))
      .filter(Boolean);
    return names.length ? names.join(', ') : '-';
  }, [roles?.rorc]);

  const rows = useMemo(() => {
    return [
      { label: 'Company registration no.', value: c?.companyRegistrationNo || '-' },
      { label: 'Country of incorporation', value: c?.countryOfIncorporation || '-' },
      { label: 'FYE', value: c?.fye || '-' },
      { label: 'Latest AGM date', value: c?.latestAgmDate || '-' },
      { label: 'Entity status', value: c?.entityStatus || '-' },
      { label: 'Incorporation date', value: formatYmd(c?.incorporationDate) },
      { label: 'Registered office address', value: c ? pickAddress(c) : '-' },
      { label: 'Paid-up capital', value: c ? formatMoney(c.paidUpCapitalCurrency, c.paidUpCapitalAmount) : '-' },
      { label: 'Total shares', value: c ? formatNumber(c.totalShares) : '-' },
      {
        label: 'SSIC (Primary)',
        value: c?.ssicPrimaryCode ? (
          <div>
            <div>{c.ssicPrimaryCode}</div>
            {ssicPrimaryDesc ? <div className="mt-0.5 text-xs text-black/50">{ssicPrimaryDesc}</div> : null}
          </div>
        ) : (
          '-'
        ),
      },
      {
        label: 'SSIC (Secondary)',
        value: c?.ssicSecondaryCode ? (
          <div>
            <div>{c.ssicSecondaryCode}</div>
            {ssicSecondaryDesc ? <div className="mt-0.5 text-xs text-black/50">{ssicSecondaryDesc}</div> : null}
          </div>
        ) : (
          '-'
        ),
      },
    ];
  }, [c, ssicPrimaryDesc, ssicSecondaryDesc]);

  const collapsedCount = 5;
  const visibleRows = expanded ? rows : rows.slice(0, collapsedCount);

  return (
    <div className="rounded-xl bg-white border border-black/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-black/90 truncate">{heading}</div>
        </div>
        <div />
      </div>

      {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="mt-4 text-xs text-black/50">Loading...</div> : null}

      <div className="mt-4 text-sm">
        {visibleRows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}

        <Row label="Directors" value={directorsText} />
        <Row label="Shareholders" value={shareholdersText} />
        <Row label="RORC" value={rorcText} />

        {rows.length > collapsedCount ? (
          <div className="py-3 border-t border-black/5">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-black/60 hover:text-black"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
