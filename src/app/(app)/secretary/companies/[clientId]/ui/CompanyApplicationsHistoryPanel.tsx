'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import StatusBadge from '@/app/(app)/corporate-secretary/applications/ui/StatusBadge';

export type CompanyApplicationHistoryRow = {
  id: string;
  typeLabel: string;
  applicationDate?: string;
  editDate?: string;
  status: string;
  detailsHref: string;
};

function fmtYmd(v?: string) {
  const s = String(v ?? '').trim();
  if (!s) return '-';
  return s.slice(0, 10);
}

export default function CompanyApplicationsHistoryPanel(props: { rows: CompanyApplicationHistoryRow[] }) {
  const [q, setQ] = useState('');

  const visible = useMemo(() => {
    const raw = q.trim().toLowerCase();
    if (!raw) return props.rows;
    return props.rows.filter((r) => {
      const hay = `${r.id} ${r.typeLabel} ${r.status}`.toLowerCase();
      return hay.includes(raw);
    });
  }, [props.rows, q]);

  return (
    <div className="mt-6 rounded-xl bg-white border border-black/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Applications</div>
          <div className="mt-1 text-xs text-black/50">Showing {visible.length} of {props.rows.length}</div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search type / id / status"
          className="w-[280px] max-w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-black/5">
        <table className="min-w-full text-sm">
          <thead className="text-left text-black/60">
            <tr className="border-b border-black/5">
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Application Date</th>
              <th className="px-4 py-3 font-medium">Edit Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                <td className="px-4 py-3 font-mono text-xs text-black/70">{r.id}</td>
                <td className="px-4 py-3">{r.typeLabel}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtYmd(r.applicationDate)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtYmd(r.editDate)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={r.detailsHref}
                    className="inline-flex rounded-md bg-[#0ea5a4] text-white px-3 py-1.5 text-xs font-medium"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                  No applications
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

