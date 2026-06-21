'use client';

import { useEffect, useState } from 'react';
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
          这是 Proxy 区域壳页。接下来可以在这里复用现有的客户门户流程，并在提交时写入 companyId + proxyMeta。
        </div>
      </div>
    </div>
  );
}

