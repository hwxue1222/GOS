'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ProxyCompanyRow = {
  id: string;
  code: string;
  name: string;
  companyRegistrationNo?: string;
  entityStatus?: string;
};

export default function ProxyCompanyPickerClient(props: { companies: ProxyCompanyRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = props.companies;
    if (!needle) return base;
    return base.filter((c) => {
      const hay = `${c.name} ${c.code} ${c.companyRegistrationNo ?? ''} ${c.entityStatus ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [props.companies, q]);

  return (
    <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm font-medium">选择要进入的公司</div>
          <div className="mt-1 text-xs text-black/60">你只会看到已授权可代理进入的公司</div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-80 rounded-lg border border-black/10 px-3 py-2 text-sm"
          placeholder="搜索公司名称/代码/注册号"
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-black/60">
            <tr className="border-b border-black/5">
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Reg No.</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Operate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-black/50">{c.id}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{c.code}</td>
                <td className="px-3 py-2 whitespace-nowrap">{c.companyRegistrationNo ?? '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{c.entityStatus ?? '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button
                    onClick={() => router.push(`/proxy/${encodeURIComponent(c.id)}`)}
                    className="rounded-md bg-[#2563eb] text-white px-3 py-1.5 text-xs font-medium"
                  >
                    进入 Proxy
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-black/40">
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

