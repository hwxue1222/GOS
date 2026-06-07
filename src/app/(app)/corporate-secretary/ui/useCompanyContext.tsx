'use client';

import { useEffect, useMemo, useState } from 'react';

type CompanyApiResponse = {
  ok: true;
  client: {
    id: string;
    name: string;
    fye?: string;
    registeredOfficeAddress?: string;
    ssicPrimaryCode?: string;
    ssicSecondaryCode?: string;
  };
  roles: {
    directors: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: { fullName: string } } }>;
    rorc: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: { fullName: string } } | { type: 'COMPANY'; company: { name: string } } }>;
    secretaries: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: { fullName: string } } }>;
  };
};

export function useCompanyContext() {
  const [companyId, setCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyApiResponse | null>(null);

  useEffect(() => {
    const id = window.localStorage.getItem('gos.currentCompanyId') ?? '';
    setCompanyId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      setLoading(true);
      try {
        if (!companyId) {
          setData(null);
          setError('NO_COMPANY');
          return;
        }
        const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}`, { cache: 'no-store' }).catch(() => null);
        const j = (await res?.json().catch(() => null)) as CompanyApiResponse | { ok: false; error?: string } | null;
        if (!res?.ok || !j || (j as any).ok !== true) {
          setData(null);
          setError((j as any)?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }
        if (cancelled) return;
        setData(j as CompanyApiResponse);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const closeHref = useMemo(() => {
    if (!companyId) return '/dashboard';
    return `/portal/companies/${encodeURIComponent(companyId)}`;
  }, [companyId]);

  return { companyId, loading, error, client: data?.client ?? null, roles: data?.roles ?? null, closeHref };
}
