'use client';

import { useEffect, useMemo, useState } from 'react';
import PaginationControls from '@/components/PaginationControls';
import { usePersistedState } from '@/lib/usePersistedState';

type AuditLog = {
  id: string;
  createdAt: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  area: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
};

const AREA_OPTIONS = ['', 'jobs', 'clients', 'invoices', 'secretary', 'members'] as const;

export default function AuditLogClient() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = usePersistedState('gos.reports.audit.q', '');
  const [area, setArea] = usePersistedState('gos.reports.audit.area', '');
  const [page, setPage] = usePersistedState('gos.reports.audit.page', 1);
  const [pageSize, setPageSize] = usePersistedState('gos.reports.audit.pageSize', 50);

  const safePageSize = Math.max(10, Math.min(200, Number(pageSize) || 50));
  const safePage = Math.max(1, Number(page) || 1);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('page', String(safePage));
    sp.set('pageSize', String(safePageSize));
    if (q.trim()) sp.set('q', q.trim());
    if (area) sp.set('area', area);
    return sp.toString();
  }, [area, q, safePage, safePageSize]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/audit-log?${query}`).catch(() => null);
        if (!res?.ok) {
          setError(`HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }
        const j = (await res.json().catch(() => null)) as { ok?: boolean; items?: AuditLog[]; total?: number } | null;
        if (!j?.ok) {
          setError('INVALID_RESPONSE');
          return;
        }
        if (!ignore) {
          setItems(Array.isArray(j.items) ? j.items : []);
          setTotal(typeof j.total === 'number' ? j.total : 0);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const pageStart = total ? (currentPage - 1) * safePageSize + 1 : 0;
  const pageEnd = Math.min(total, (currentPage - 1) * safePageSize + items.length);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select
            value={area}
            onChange={(e) => {
              const v = e.target.value;
              setArea(v);
              setPage(1);
            }}
            className="rounded-md border border-black/10 px-2 py-2 text-sm bg-white"
          >
            {AREA_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a ? a : 'All areas'}
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search actor/action/summary"
            className="w-full sm:w-[320px] rounded-md border border-black/10 px-3 py-2 text-sm"
          />
        </div>
        <PaginationControls
          total={total}
          pageStart={pageStart}
          pageEnd={pageEnd}
          page={currentPage}
          totalPages={totalPages}
          pageSize={safePageSize}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-black/60">
            <tr className="border-b border-black/5">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Time</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Actor</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Area</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Action</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Entity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                  Loading...
                </td>
              </tr>
            ) : null}
            {!loading
              ? items.map((it) => (
                  <tr key={it.id} className="border-b border-black/5">
                    <td className="px-4 py-3 whitespace-nowrap">{it.createdAt.slice(0, 19).replace('T', ' ')}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{it.actorName ?? '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{it.area}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{it.action}</td>
                    <td className="px-4 py-3">{it.summary}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {it.entityType ? `${it.entityType}:${it.entityId ?? ''}` : '-'}
                    </td>
                  </tr>
                ))
              : null}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                  No logs
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

