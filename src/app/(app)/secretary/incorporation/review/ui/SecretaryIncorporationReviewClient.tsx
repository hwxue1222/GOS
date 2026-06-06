'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ReviewRow = {
  applicationId: string;
  type: 'REGISTER_COMPANY' | 'TRANSFER_COMPANY_SECRETARY';
  companyName: string;
  status: string;
  applicationDate: string;
  editDate: string;
};

export default function SecretaryIncorporationReviewClient({ rows }: { rows: ReviewRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(row: ReviewRow, toStatus: 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED') {
    setError(null);
    setBusyId(row.applicationId);
    try {
      const note = window.prompt('Note (optional)') ?? '';
      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(row.applicationId)}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toStatus, note, assignToMe: true }),
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
            {rows.map((r) => {
              const detailsHref = `/incorporation/applications/${encodeURIComponent(r.applicationId)}`;
              return (
                <tr key={r.applicationId} className="border-b border-black/5">
                  <td className="px-3 py-2">INC-{r.applicationId}</td>
                  <td className="px-3 py-2">{r.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer Secretary'}</td>
                  <td className="px-3 py-2">{r.companyName}</td>
                  <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                  <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <span className={r.status === 'REJECTED' ? 'text-red-600' : r.status === 'NEED_MORE_INFO' ? 'text-[#d97706]' : 'text-[#16a34a]'}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={detailsHref} className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium">
                        Details
                      </Link>
                      <button
                        disabled={busyId === r.applicationId}
                        onClick={() => void decide(r, 'PROCESSING')}
                        className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                      >
                        Processing
                      </button>
                      <button
                        disabled={busyId === r.applicationId}
                        onClick={() => void decide(r, 'NEED_MORE_INFO')}
                        className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                      >
                        Need info
                      </button>
                      <button
                        disabled={busyId === r.applicationId}
                        onClick={() => void decide(r, 'COMPLETED')}
                        className="rounded-md bg-[#46b35a] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                      >
                        Complete
                      </button>
                      <button
                        disabled={busyId === r.applicationId}
                        onClick={() => void decide(r, 'REJECTED')}
                        className="rounded-md bg-[#dc2626] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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

