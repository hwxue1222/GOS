'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ReviewRow = {
  id: string;
  typeLabel: string;
  viaProxy?: boolean;
  companyId: string;
  companyName: string;
  applicationDate: string;
  editDate: string;
  status: string;
  detailsHref: string;
  decisionUrl: string;
  deleteUrl?: string;
};

function ellipsizeId(id: string) {
  const s = String(id ?? '');
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-4)}`;
}

export default function SecretaryCsReviewClient({ rows, canWrite }: { rows: ReviewRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(row: ReviewRow, decision: 'APPROVE' | 'REJECT') {
    if (busyId) return;
    if (!canWrite) return;
    setError(null);
    setBusyId(row.id);
    try {
      const noteRaw = window.prompt('Note (optional)');
      if (noteRaw === null) return;
      const note = noteRaw;
      const res = await fetch(row.decisionUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: ReviewRow) {
    if (busyId) return;
    if (!canWrite) return;
    if (row.status !== 'REJECTED') return;
    if (!row.deleteUrl) return;
    const ok = window.confirm(`Delete rejected application ${row.id}?`);
    if (!ok) return;
    setError(null);
    setBusyId(row.id);
    try {
      const res = await fetch(row.deleteUrl, { method: 'DELETE' }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-4">
      {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-black/60">
            <tr className="border-b border-black/5">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Application Date</th>
              <th className="px-3 py-2 font-medium">Edit Date</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Operate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="px-3 py-2" title={r.id}>
                  {ellipsizeId(r.id)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>{r.typeLabel}</span>
                    {r.viaProxy ? (
                      <span className="rounded-full bg-black/5 border border-black/10 px-2 py-0.5 text-[10px] font-medium text-black/60">
                        via Proxy
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">{r.companyName}</td>
                <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <span className={r.status === 'PENDING_REVIEW' ? 'text-[#16a34a]' : r.status === 'SIGNING' ? 'text-[#d97706]' : 'text-black/70'}>{r.status}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={r.detailsHref}
                      className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                    >
                      Details
                    </Link>
                    {canWrite ? (
                      r.status === 'REJECTED' ? (
                        <button
                          disabled={!!busyId}
                          onClick={() => void remove(r)}
                          className="rounded-md bg-white border border-black/10 text-red-600 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                        >
                          Delete
                        </button>
                      ) : r.status === 'PENDING_REVIEW' || r.status === 'SIGNING' || r.status === 'NEED_MORE_INFO' ? (
                        <>
                          <button
                            disabled={!!busyId}
                            onClick={() => void decide(r, 'APPROVE')}
                            className="rounded-md bg-[#46b35a] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            disabled={!!busyId}
                            onClick={() => void decide(r, 'REJECT')}
                            className="rounded-md bg-[#dc2626] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <div className="text-xs text-black/50">
                          {r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'COMPLETE'
                              ? 'Decided'
                              : '-'}
                        </div>
                      )
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-black/40">
                  No data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
