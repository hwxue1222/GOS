'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import DirectorChangeRequestsPanel from '@/app/(app)/secretary/companies/[clientId]/ui/DirectorChangeRequestsPanel';
import { usePersistedState } from '@/lib/usePersistedState';

type ShareTransfer = {
  id: string;
  clientId: string;
  shareClass?: string;
  shares: number;
  effectiveDate: string;
  status: string;
  createdAt: string;
};

type Props = {
  clientId: string;
  directors: Array<{ roleId: string; fullName: string; email?: string }>;
  canSubmitDirectorChange: boolean;
  canApproveDirectorChange: boolean;
};

function formatDate(d: string | undefined) {
  const s = String(d ?? '').trim();
  if (!s) return '-';
  return s.slice(0, 10);
}

export default function CorporateSecretaryServicesPanel({ clientId, directors, canSubmitDirectorChange, canApproveDirectorChange }: Props) {
  const [tab, setTab] = usePersistedState(`gos.secretary.company.${clientId}.services.tab`, 'director');
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [transfers, setTransfers] = useState<ShareTransfer[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const s = (sp.get('service') ?? '').trim();
      if (s === 'share_transfer') setTab('share_transfer');
      if (s === 'director') setTab('director');
    } catch {
      return;
    }
  }, [setTab]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (tab !== 'share_transfer') return;
      setLoadingTransfers(true);
      setTransferError(null);
      try {
        const res = await fetch('/api/secretary/share-transfers', { cache: 'no-store' }).catch(() => null);
        if (!res?.ok) {
          setTransferError(`HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }
        const j = (await res.json().catch(() => null)) as { transfers?: unknown } | null;
        const all = Array.isArray(j?.transfers) ? (j!.transfers as ShareTransfer[]) : [];
        const filtered = all.filter((t) => t.clientId === clientId);
        filtered.sort((a, b) => {
          if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
          return b.id.localeCompare(a.id);
        });
        if (!ignore) setTransfers(filtered);
      } finally {
        if (!ignore) setLoadingTransfers(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [clientId, tab]);

  const visibleTransfers = useMemo(() => transfers.slice(0, 10), [transfers]);

  return (
    <div className="rounded-xl bg-white border border-black/5">
      <div className="p-4 border-b border-black/5 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Corporate Secretary Services</div>
          <div className="mt-0.5 text-sm text-black/50">Change of Director / Transfer of Shares</div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setTab('director')}
            className={[
              'rounded-full px-3 py-1.5 border',
              tab === 'director' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
            ].join(' ')}
          >
            Change of Director
          </button>
          <button
            onClick={() => setTab('share_transfer')}
            className={[
              'rounded-full px-3 py-1.5 border',
              tab === 'share_transfer' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
            ].join(' ')}
          >
            Transfer of Shares
          </button>
        </div>
      </div>

      <div className="p-4">
        {tab === 'director' ? (
          <DirectorChangeRequestsPanel clientId={clientId} directors={directors} canSubmit={canSubmitDirectorChange} canApprove={canApproveDirectorChange} />
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-black/60">Recent transfers (latest 10)</div>
              <Link
                href={`/secretary/share-transfers?clientId=${encodeURIComponent(clientId)}`}
                className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-sm font-medium"
              >
                Open
              </Link>
            </div>

            {transferError ? <div className="mt-3 text-sm text-red-600">{transferError}</div> : null}

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-black/60">
                  <tr className="border-b border-black/5">
                    <th className="px-3 py-2 font-medium">Effective</th>
                    <th className="px-3 py-2 font-medium">Shares</th>
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTransfers ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-black/50">
                        Loading...
                      </td>
                    </tr>
                  ) : null}
                  {!loadingTransfers
                    ? visibleTransfers.map((t) => (
                        <tr key={t.id} className="border-b border-black/5">
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.effectiveDate)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{Number(t.shares).toLocaleString()}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{t.shareClass ?? '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{t.status}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{t.id}</td>
                        </tr>
                      ))
                    : null}
                  {!loadingTransfers && visibleTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-black/50">
                        No transfers
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
