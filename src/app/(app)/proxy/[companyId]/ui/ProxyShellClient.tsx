'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="text-sm font-semibold text-black">Incorporation of Company</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/incorporation/register"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Register Company
              </Link>
              <Link
                href="/incorporation/transfer-secretary"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Transfer of Company Secretary
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="text-sm font-semibold text-black">Corporate Secretary Services</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/corporate-secretary/change-company-name"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Change of Company Name
              </Link>
              <Link
                href="/corporate-secretary/change-address"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Change of Address
              </Link>
              <Link
                href="/corporate-secretary/change-business-activities"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Change of Activities
              </Link>
              <Link
                href="/corporate-secretary/change-fye"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Change of FYE
              </Link>
              <Link
                href="/corporate-secretary/change-secretary"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Change of Secretary
              </Link>
              <Link
                href="/corporate-secretary/rorc"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                RORC
              </Link>
              <Link
                href="/corporate-secretary/agm"
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                AGM
              </Link>
              <Link
                href={`/secretary/share-transfers?clientId=${encodeURIComponent(props.company.id)}`}
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Share Transfer
              </Link>
              <Link
                href={`/corporate-secretary/applications/new/director-change?companyId=${encodeURIComponent(props.company.id)}`}
                onClick={() => window.localStorage.setItem('gos.currentCompanyId', props.company.id)}
                className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
              >
                Director Change
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
