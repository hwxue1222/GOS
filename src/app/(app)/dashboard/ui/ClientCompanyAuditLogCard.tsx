'use client';

import { useEffect, useMemo, useState } from 'react';

import ActivityTimelineCard from '@/app/(app)/corporate-secretary/applications/ui/ActivityTimelineCard';
import { auditLogsToTimelineItems } from '@/app/(app)/corporate-secretary/applications/ui/timeline';
import type { AuditLog } from '@/lib/types';

function readCurrentCompanyId() {
  return (window.sessionStorage.getItem('gos.currentCompanyId') ?? '').trim();
}

export default function ClientCompanyAuditLogCard(props: { limit?: number }) {
  const [companyId, setCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    function syncFromStorage() {
      const id = readCurrentCompanyId();
      if (!id) return;
      setCompanyId(id);
    }
    function onCompanyChanged() {
      syncFromStorage();
    }
    syncFromStorage();
    window.addEventListener('gos.companyChanged', onCompanyChanged as EventListener);
    return () => {
      window.removeEventListener('gos.companyChanged', onCompanyChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    const limit = typeof props.limit === 'number' && Number.isFinite(props.limit) ? Math.max(1, Math.min(200, Math.floor(props.limit))) : 20;
    fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/audit-logs?limit=${encodeURIComponent(String(limit))}`, {
      cache: 'no-store',
    })
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (ignore) return;
        if (!j?.ok) {
          setError(j?.error ?? 'FAILED_TO_LOAD');
          setLogs([]);
          return;
        }
        setLogs(Array.isArray(j.logs) ? (j.logs as AuditLog[]) : []);
      })
      .catch(() => {
        if (ignore) return;
        setError('NETWORK');
        setLogs([]);
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [companyId, props.limit]);

  const items = useMemo(() => {
    return auditLogsToTimelineItems({ logs, titlePrefix: '' });
  }, [logs]);

  return (
    <div>
      {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
      {loading && !logs.length ? <div className="mb-3 text-xs text-black/50">Loading...</div> : null}
      <ActivityTimelineCard title="Change history" subtitle="Recent updates for the selected company." items={items} />
    </div>
  );
}

