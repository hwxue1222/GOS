 'use client';

import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';
import { useMemo, useState } from 'react';

export type AcraRecordRow = {
  id: string;
  typeKey: string;
  typeLabel: string;
  companyId: string;
  companyName: string;
  applicationDate: string;
  editDate: string;
  status: string;
  detailsHref: string;
  decisionUrl?: string;
  deleteUrl?: string;
};

function statusPill(s: string) {
  if (s === 'REJECTED') return 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]';
  if (s === 'NEED_MORE_INFO') return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
  if (s === 'PENDING_REVIEW') return 'bg-[#faf5ff] text-[#6d28d9] border-[#e9d5ff]';
  if (s === 'DRAFT') return 'bg-black/[0.02] text-black/70 border-black/10';
  if (s === 'SIGNING') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  if (s === 'APPROVED' || s === 'COMPLETE' || s === 'COMPLETED') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  return 'bg-white text-black/70 border-black/10';
}

export default function AcraFilingRecordsTable(props: {
  companies: Array<{ id: string; name: string }>;
  allRows: AcraRecordRow[];
  visibleRows: AcraRecordRow[];
  filterCompanyId: string;
  filterType: string;
  filterStatus: string;
  canWrite: boolean;
}) {
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return props.visibleRows;
    return props.visibleRows.filter((r) => {
      const hay = `${r.typeLabel} ${r.companyName} ${r.companyId} ${r.status} ${r.id}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [props.visibleRows, q]);

  return (
    <div className="mt-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl bg-white border border-black/5 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full md:w-[420px] rounded-lg border border-black/10 px-3 py-2 text-sm"
          placeholder="Search applications"
        />
        <div className="text-xs text-black/50">Showing {rows.length} of {props.visibleRows.length}</div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl bg-white border border-black/5 p-10 text-center">
          <div className="text-base font-semibold text-black">No applications</div>
          <div className="mt-2 text-sm text-black/50">Try adjusting your search.</div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black/60 bg-black/[0.02]">
                <tr className="border-b border-black/10">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Company Name</th>
                  <th className="px-3 py-2 font-medium">Application Date</th>
                  <th className="px-3 py-2 font-medium">Edit Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Operate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-3 py-2">{r.typeLabel}</td>
                    <td className="px-3 py-2">{r.companyName}</td>
                    <td className="px-3 py-2">{formatDateDMY(r.applicationDate.slice(0, 10))}</td>
                    <td className="px-3 py-2">{formatDateDMY(r.editDate.slice(0, 10))}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusPill(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={r.detailsHref}
                          className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium hover:brightness-95"
                        >
                          Details
                        </Link>
                        {props.canWrite ? (
                          r.decisionUrl || r.deleteUrl ? (
                            <Link
                              href="/secretary/acra-filing"
                              className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.02]"
                            >
                              Review
                            </Link>
                          ) : null
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
