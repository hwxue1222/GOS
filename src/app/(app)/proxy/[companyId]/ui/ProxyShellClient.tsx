'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function ProxyShellClient(props: { company: Company }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const services = useMemo(
    () =>
      [
        {
          group: 'Incorporation of Company',
          items: [
            { label: 'Register Company', href: '/incorporation/register' },
            { label: 'Transfer of Company Secretary', href: '/incorporation/transfer-secretary' },
          ],
        },
        {
          group: 'Corporate Secretary Services',
          items: [
            { label: 'Applications', href: `/corporate-secretary/applications?companyId=${encodeURIComponent(props.company.id)}` },
            { label: 'Change of Company Name', href: '/corporate-secretary/change-company-name' },
            { label: 'Change of Address', href: '/corporate-secretary/change-address' },
            { label: 'Change of Activities', href: '/corporate-secretary/change-business-activities' },
            { label: 'Change of FYE', href: '/corporate-secretary/change-fye' },
            { label: 'Change of Secretary', href: '/corporate-secretary/change-secretary' },
            { label: 'RORC', href: '/corporate-secretary/rorc' },
            { label: 'AGM', href: '/corporate-secretary/agm' },
            {
              label: 'Share Transfer',
              href: `/secretary/share-transfers?clientId=${encodeURIComponent(props.company.id)}`,
            },
            { label: 'Director Change', href: '/corporate-secretary/applications/new/director-change' },
          ],
        },
      ] as const,
    [props.company.id],
  );

  useEffect(() => {
    window.localStorage.setItem('gos.currentCompanyId', props.company.id);
    void postAudit({ action: 'enter', companyId: props.company.id, proxyMeta: { route: `/proxy/${props.company.id}` } });
  }, [props.company.id]);

  function go(href: string) {
    if (busy) return;
    window.localStorage.setItem('gos.currentCompanyId', props.company.id);
    router.push(href);
  }

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

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {services.map((g) => (
            <div key={g.group} className="rounded-xl border border-black/10 bg-white p-4">
              <div className="text-sm font-semibold text-black">{g.group}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {g.items.map((it) => (
                  <button
                    key={it.href}
                    disabled={busy}
                    onClick={() => go(it.href)}
                    className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02] disabled:opacity-60"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
