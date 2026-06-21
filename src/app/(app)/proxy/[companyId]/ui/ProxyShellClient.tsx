'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { IncorporationApplicationRow } from '@/lib/incorporationApplications';
import type { SecretaryServiceApplicationRow } from '@/lib/types';

type Company = {
  id: string;
  code: string;
  name: string;
};

async function postAudit(input: { action: 'enter' | 'exit' | 'switch'; companyId: string; proxyMeta?: Record<string, unknown> }) {
  const res = await fetch('/api/proxy/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => null);
  if (!res?.ok) return;
}

export default function ProxyShellClient(props: {
  company: Company;
  incRows: IncorporationApplicationRow[];
  csRows: SecretaryServiceApplicationRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.localStorage.setItem('gos.currentCompanyId', props.company.id);
    void postAudit({ action: 'enter', companyId: props.company.id, proxyMeta: { route: `/proxy/${props.company.id}` } });
  }, [props.company.id]);

  async function exit() {
    if (busy) return;
    setBusy(true);
    try {
      await postAudit({ action: 'exit', companyId: props.company.id, proxyMeta: { route: `/proxy/${props.company.id}` } });
    } finally {
      router.push('/proxy');
      setBusy(false);
    }
  }

  async function switchCompany() {
    if (busy) return;
    setBusy(true);
    try {
      await postAudit({ action: 'switch', companyId: props.company.id, proxyMeta: { route: `/proxy/${props.company.id}` } });
    } finally {
      router.push('/proxy');
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-white border border-black/5">
      <div className="p-4 border-b border-black/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm text-black/60">PROXY MODE · Acting as BBY.SG Pte Ltd</div>
          <div className="mt-1 text-lg font-semibold">
            {props.company.name} <span className="text-black/40 text-sm">({props.company.code})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={busy}
            onClick={() => void switchCompany()}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-60"
          >
            切换公司
          </button>
          <button
            disabled={busy}
            onClick={() => void exit()}
            className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            退出 Proxy
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="rounded-lg bg-black/[0.02] border border-black/5 p-4 text-sm text-black/70">
          你正在以 BBY.SG Pte Ltd 的身份代理进入该公司。下方为可复用的前台服务入口。
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-white border border-black/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Incorporation of Company</div>
                <div className="mt-0.5 text-sm text-black/50">Applications</div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/incorporation/register"
                  onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                  className="rounded-md bg-[#2f7bdc] text-white px-3 py-2 text-sm font-medium"
                >
                  Register
                </Link>
                <Link
                  href="/incorporation/transfer-secretary"
                  onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                  className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
                >
                  Transfer
                </Link>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-black/60">
                  <tr className="border-b border-black/5">
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Company Name</th>
                    <th className="px-3 py-2 font-medium">Application Date</th>
                    <th className="px-3 py-2 font-medium">Edit Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Operate</th>
                  </tr>
                </thead>
                <tbody>
                  {props.incRows.map((r) => {
                    const detailsHref = `/incorporation/applications/${encodeURIComponent(r.sourceId)}`;
                    const typeLabel = r.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary';
                    return (
                      <tr key={r.id} className="border-b border-black/5">
                        <td className="px-3 py-2">{typeLabel}</td>
                        <td className="px-3 py-2">{r.companyName}</td>
                        <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              r.status === 'REJECTED'
                                ? 'text-red-600'
                                : r.status === 'NEED_MORE_INFO'
                                  ? 'text-[#d97706]'
                                  : 'text-[#16a34a]'
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Link
                              href={detailsHref}
                              onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                              className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                            >
                              Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {props.incRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-black/40">
                        No data
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-black/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Corporate Secretary</div>
                <div className="mt-0.5 text-sm text-black/50">Applications</div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/corporate-secretary/applications?companyId=${encodeURIComponent(props.company.id)}`}
                  onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                  className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
                >
                  View all
                </Link>
                <Link
                  href={`/corporate-secretary/applications/new/director-change?companyId=${encodeURIComponent(props.company.id)}`}
                  onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                  className="rounded-md bg-[#2f7bdc] text-white px-3 py-2 text-sm font-medium"
                >
                  New
                </Link>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-black/60">
                  <tr className="border-b border-black/5">
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Company Name</th>
                    <th className="px-3 py-2 font-medium">Application Date</th>
                    <th className="px-3 py-2 font-medium">Edit Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Operate</th>
                  </tr>
                </thead>
                <tbody>
                  {props.csRows.map((r) => {
                    const map = (() => {
                      if (r.type === 'DIRECTOR_CHANGE') {
                        const detailsHref = `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Change of Director', detailsHref };
                      }
                      if (r.type === 'SHARE_TRANSFER') {
                        const detailsHref = `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Transfer of Shares', detailsHref };
                      }
                      if (r.type === 'CHANGE_COMPANY_NAME') {
                        const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Change of Company Name', detailsHref };
                      }
                      if (r.type === 'CHANGE_FINANCIAL_YEAR_END') {
                        const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Change of Financial Year End (FYE)', detailsHref };
                      }
                      if (r.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
                        const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Change of Registered Office Address', detailsHref };
                      }
                      if (r.type === 'CHANGE_BUSINESS_ACTIVITIES') {
                        const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Change of Business Activities', detailsHref };
                      }
                      if (r.type === 'CHANGE_SECRETARY') {
                        const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Change of Secretary', detailsHref };
                      }
                      if (r.type === 'RORC_DECLARATION') {
                        const detailsHref = `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Declaration of Company Controller (RORC)', detailsHref };
                      }
                      if (r.type === 'ANNUAL_GENERAL_MEETING') {
                        const detailsHref = `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`;
                        return { typeLabel: 'Annual General Meeting', detailsHref };
                      }
                      const detailsHref = `/corporate-secretary/applications?companyId=${encodeURIComponent(props.company.id)}`;
                      return { typeLabel: r.type, detailsHref };
                    })();
                    return (
                      <tr key={r.id} className="border-b border-black/5">
                        <td className="px-3 py-2">{map.typeLabel}</td>
                        <td className="px-3 py-2">{r.companyName}</td>
                        <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              r.status === 'REJECTED'
                                ? 'text-red-600'
                                : r.status === 'NEED_MORE_INFO'
                                  ? 'text-[#d97706]'
                                  : r.status === 'SIGNING'
                                    ? 'text-[#0ea5e9]'
                                    : 'text-[#16a34a]'
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Link
                              href={map.detailsHref}
                              onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                              className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                            >
                              Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {props.csRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-black/40">
                        No data
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
