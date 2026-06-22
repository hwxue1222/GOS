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
    directors: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: PersonLite } }>;
    shareholders: Array<
      | { role: { id: string }; entity: { type: 'PERSON'; person: PersonLite } }
      | { role: { id: string }; entity: { type: 'COMPANY'; company: CompanyLite } }
    >;
    rorc: Array<
      {
        role: { id: string };
        entity: { type: 'PERSON'; person: PersonLite } | { type: 'COMPANY'; company: { name: string } };
      }
    >;
    secretaries: Array<{ role: { id: string }; entity: { type: 'PERSON'; person: PersonLite } }>;
  };
};

type PersonLite = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  idType?: string;
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
};

type CompanyLite = {
  id: string;
  code: string;
  name: string;
  companyRegistrationNo?: string;
  countryOfIncorporation?: string;
  address?: string;
  registeredOfficeAddress?: string;
};

export function useCompanyContext() {
  const [companyId, setCompanyId] = useState<string>('');
  const [proxyCompanyId, setProxyCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyApiResponse | null>(null);

  useEffect(() => {
    try {
      const sessionId = window.sessionStorage.getItem('gos.currentCompanyId') ?? '';
      const localId = sessionId ? '' : window.localStorage.getItem('gos.currentCompanyId') ?? '';
      const id = sessionId || localId;
      if (id && localId) {
        window.sessionStorage.setItem('gos.currentCompanyId', id);
        window.localStorage.removeItem('gos.currentCompanyId');
      }
      setCompanyId(id);

      const sessionPid = window.sessionStorage.getItem('gos.proxyCompanyId') ?? '';
      const localPid = sessionPid ? '' : window.localStorage.getItem('gos.proxyCompanyId') ?? '';
      const pid = sessionPid || localPid;
      if (pid && localPid) {
        window.sessionStorage.setItem('gos.proxyCompanyId', pid);
        window.localStorage.removeItem('gos.proxyCompanyId');
      }
      setProxyCompanyId(pid);
    } catch {
      setCompanyId('');
      setProxyCompanyId('');
    }
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
    if (proxyCompanyId && proxyCompanyId === companyId) return `/proxy/${encodeURIComponent(companyId)}`;
    return `/portal/companies/${encodeURIComponent(companyId)}`;
  }, [companyId, proxyCompanyId]);

  return { companyId, loading, error, client: data?.client ?? null, roles: data?.roles ?? null, closeHref };
}
