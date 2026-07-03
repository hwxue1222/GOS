'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateDMY } from '@/lib/date';

export type ProxyHomeCompanyRow = {
  id: string;
  code: string;
  name: string;
  companyRegistrationNo?: string;
  entityStatus?: string;
};

export type ProxySubmittedRecordRow = {
  id: string;
  typeLabel: string;
  companyId: string;
  companyName: string;
  applicationDate: string;
  editDate: string;
  status: string;
  createdByName: string;
  detailsHref: string;
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

export default function ProxyHomeClient(props: { companies: ProxyHomeCompanyRow[]; records: ProxySubmittedRecordRow[] }) {
  const router = useRouter();
  const [recordQ, setRecordQ] = useState('');

  const visibleRecords = useMemo(() => {
    const needle = recordQ.trim().toLowerCase();
    if (!needle) return props.records;
    return props.records.filter((r) => {
      const hay = `${r.companyName} ${r.companyId} ${r.typeLabel} ${r.id} ${r.status} ${r.createdByName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [props.records, recordQ]);

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-sm font-medium">选择要进入的公司</div>
            <div className="mt-1 text-xs text-black/60">你只会看到已授权可代理进入的公司</div>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              router.push(`/proxy/${encodeURIComponent(id)}`);
            }}
            className="w-full sm:max-w-[520px] truncate rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">请选择公司（Select a company）</option>
            {props.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <div className="text-xs text-black/50">选中后会自动进入该公司 Proxy</div>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Proxy submitted applications</div>
            <div className="mt-1 text-xs text-black/60">仅显示通过 Proxy 提交的 Company Update 与 Share Transfer</div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              value={recordQ}
              onChange={(e) => setRecordQ(e.target.value)}
              className="w-full sm:w-80 rounded-lg border border-black/10 px-3 py-2 text-sm"
              placeholder="搜索公司/类型/ID/状态/创建人"
            />
            <div className="text-xs text-black/50">Showing {visibleRecords.length} of {props.records.length}</div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/5">
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Application Date</th>
                <th className="px-3 py-2 font-medium">Edit Date</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created By</th>
                <th className="px-3 py-2 font-medium">Operate</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((r) => (
                <tr key={r.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2 whitespace-nowrap">{r.typeLabel}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.companyName}</div>
                    <div className="text-xs text-black/50">{r.companyId}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateDMY(r.applicationDate.slice(0, 10))}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateDMY(r.editDate.slice(0, 10))}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusPill(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.createdByName || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link href={r.detailsHref} className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium hover:brightness-95">
                        Details
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleRecords.length === 0 ? (
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

      <div className="text-xs text-black/50">
        <Link href="/secretary/acra-filing" className="text-[#2f7bdc] hover:underline">
          Open ACRA Filing
        </Link>
      </div>
    </div>
  );
}
