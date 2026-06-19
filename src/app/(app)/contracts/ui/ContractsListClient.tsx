'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePersistedState } from '@/lib/usePersistedState';
import { formatDateDMY } from '@/lib/date';
import type { Contract, ContractStatus } from '@/lib/types';

type Row = {
  contract: Contract;
  templateName: string;
};

type Props = {
  initialRows: Row[];
};

function textMatch(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function statusLabel(status: ContractStatus) {
  if (status === 'SIGNED') return { text: 'SIGNED', cls: 'bg-green-100 text-green-700' };
  if (status === 'SIGNING') return { text: 'SIGNING', cls: 'bg-blue-100 text-blue-700' };
  if (status === 'READY') return { text: 'READY', cls: 'bg-amber-100 text-amber-700' };
  if (status === 'VOID') return { text: 'VOID', cls: 'bg-black/10 text-black/70' };
  return { text: 'DRAFT', cls: 'bg-black/10 text-black/70' };
}

function monthKeyFromIso(iso: string) {
  const s = String(iso ?? '');
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}

export default function ContractsListClient({ initialRows }: Props) {
  const router = useRouter();
  const [search, setSearch] = usePersistedState('gos.contracts.search', '');
  const [status, setStatus] = usePersistedState<ContractStatus | ''>('gos.contracts.status', '');
  const [month, setMonth] = usePersistedState('gos.contracts.month', '');
  const [deletingId, setDeletingId] = useState<string>('');

  const rows = useMemo(() => {
    const q = search.trim();
    return initialRows
      .filter((r) => {
        if (status && r.contract.status !== status) return false;
        if (month && monthKeyFromIso(r.contract.createdAt) !== month) return false;
        if (!q) return true;
        return textMatch(
          `${r.contract.contractNo} ${r.contract.clientName} ${r.contract.clientEmail} ${r.templateName} ${r.contract.status}`,
          q,
        );
      })
      .sort((a, b) => b.contract.createdAt.localeCompare(a.contract.createdAt));
  }, [initialRows, month, search, status]);

  const months = useMemo(() => {
    const keys = new Set<string>();
    for (const r of initialRows) {
      const k = monthKeyFromIso(r.contract.createdAt);
      if (k) keys.add(k);
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [initialRows]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Contracts</div>
          <div className="text-sm text-black/60 mt-1">Create from template, download PDF, and send for OTP signing.</div>
        </div>
        <Link
          href="/contracts/new"
          className="h-10 px-4 rounded-lg bg-black text-white text-sm font-medium flex items-center hover:bg-black/90 transition-colors"
        >
          New contract
        </Link>
      </div>

      <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contract no / client"
            className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            <option value="">All status</option>
            <option value="DRAFT">DRAFT</option>
            <option value="READY">READY</option>
            <option value="SIGNING">SIGNING</option>
            <option value="SIGNED">SIGNED</option>
            <option value="VOID">VOID</option>
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white border border-black/5 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-xs font-semibold text-black/60 border-b border-black/5">
          <div className="col-span-3">Contract No</div>
          <div className="col-span-3">Client</div>
          <div className="col-span-2">Template</div>
          <div className="col-span-2">Created</div>
          <div className="col-span-2">Status</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-black/60">No results</div>
        ) : (
          rows.map((r) => {
            const st = statusLabel(r.contract.status);
            const canDelete =
              (r.contract.status === 'DRAFT' || r.contract.status === 'READY') &&
              !String((r.contract as any).packetId ?? '').trim() &&
              !String((r.contract as any).signedAt ?? '').trim();
            const href =
              r.contract.status === 'DRAFT' || r.contract.status === 'READY'
                ? `/contracts/new?contractId=${encodeURIComponent(r.contract.id)}`
                : `/contracts/${encodeURIComponent(r.contract.id)}`;
            return (
              <Link
                key={r.contract.id}
                href={href}
                className="grid grid-cols-12 px-4 py-3 text-sm border-b border-black/5 hover:bg-black/[0.02] transition-colors"
              >
                <div className="col-span-3 font-medium truncate">{String(r.contract.contractNo ?? '').trim() || '—'}</div>
                <div className="col-span-3 truncate">
                  <div className="font-medium truncate">{r.contract.clientName}</div>
                  <div className="text-xs text-black/60 truncate">{r.contract.clientEmail}</div>
                </div>
                <div className="col-span-2 truncate">{r.templateName}</div>
                <div className="col-span-2 truncate">{formatDateDMY(r.contract.createdAt)}</div>
                <div className="col-span-2 flex items-center justify-between gap-2">
                  <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${st.cls}`}>{st.text}</span>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (deletingId) return;
                        const no = String(r.contract.contractNo ?? '').trim();
                        if (!confirm(`Delete this draft${no ? ` (${no})` : ''}?`)) return;
                        setDeletingId(r.contract.id);
                        void fetch(`/api/contracts/${encodeURIComponent(r.contract.id)}`, { method: 'DELETE' })
                          .then((res) => res.json().catch(() => null).then((j) => ({ res, j })))
                          .then(({ res, j }) => {
                            if (!res.ok || !j?.ok) {
                              alert(String(j?.error ?? `HTTP_${res.status}`));
                              return;
                            }
                            router.refresh();
                          })
                          .finally(() => setDeletingId(''));
                      }}
                      disabled={deletingId === r.contract.id}
                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                    >
                      {deletingId === r.contract.id ? 'Deleting…' : 'Delete'}
                    </button>
                  ) : null}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
