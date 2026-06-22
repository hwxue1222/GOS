'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type CompanyInfo = { id: string; name: string; code: string };

async function postAudit(input: { action: 'enter' | 'exit'; companyId: string; proxyMeta?: Record<string, unknown> }) {
  const res = await fetch('/api/proxy/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => null);
  if (!res?.ok) return;
}

function readProxyCompanyFromStorage(): CompanyInfo | null {
  const sessionId = window.sessionStorage.getItem('gos.proxyCompanyId') ?? '';
  const localId = sessionId ? '' : window.localStorage.getItem('gos.proxyCompanyId') ?? '';
  const id = sessionId || localId;

  const sessionName = window.sessionStorage.getItem('gos.proxyCompanyName') ?? '';
  const localName = sessionName ? '' : window.localStorage.getItem('gos.proxyCompanyName') ?? '';
  const name = sessionName || localName;

  const sessionCode = window.sessionStorage.getItem('gos.proxyCompanyCode') ?? '';
  const localCode = sessionCode ? '' : window.localStorage.getItem('gos.proxyCompanyCode') ?? '';
  const code = sessionCode || localCode;

  if (id && localId) {
    window.sessionStorage.setItem('gos.currentCompanyId', id);
    window.sessionStorage.setItem('gos.proxyCompanyId', id);
    if (name) window.sessionStorage.setItem('gos.proxyCompanyName', name);
    if (code) window.sessionStorage.setItem('gos.proxyCompanyCode', code);
    window.localStorage.removeItem('gos.currentCompanyId');
    window.localStorage.removeItem('gos.proxyCompanyId');
    window.localStorage.removeItem('gos.proxyCompanyName');
    window.localStorage.removeItem('gos.proxyCompanyCode');
  }
  if (!id) return null;
  return { id, name, code };
}

function writeProxyCompanyToStorage(c: CompanyInfo) {
  window.sessionStorage.setItem('gos.currentCompanyId', c.id);
  window.sessionStorage.setItem('gos.proxyCompanyId', c.id);
  window.sessionStorage.setItem('gos.proxyCompanyName', c.name);
  window.sessionStorage.setItem('gos.proxyCompanyCode', c.code);
  window.localStorage.removeItem('gos.currentCompanyId');
  window.localStorage.removeItem('gos.proxyCompanyId');
  window.localStorage.removeItem('gos.proxyCompanyName');
  window.localStorage.removeItem('gos.proxyCompanyCode');
}

function clearProxyCompanyFromStorage() {
  window.sessionStorage.removeItem('gos.proxyCompanyId');
  window.sessionStorage.removeItem('gos.proxyCompanyName');
  window.sessionStorage.removeItem('gos.proxyCompanyCode');
  window.localStorage.removeItem('gos.proxyCompanyId');
  window.localStorage.removeItem('gos.proxyCompanyName');
  window.localStorage.removeItem('gos.proxyCompanyCode');
}

export default function ProxyContextBlockClient(props: {
  bootstrapCompany?: CompanyInfo;
  variant?: 'full' | 'compact';
  sticky?: boolean;
}) {
  const router = useRouter();
  const variant = props.variant ?? 'full';
  const sticky = props.sticky ?? true;
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    if (props.bootstrapCompany) {
      writeProxyCompanyToStorage(props.bootstrapCompany);
      setCompany(props.bootstrapCompany);
      return;
    }
    setCompany(readProxyCompanyFromStorage());
  }, [props.bootstrapCompany]);

  if (!company?.id) return null;

  async function exitProxy() {
    if (busy) return;
    const companyId = company?.id;
    if (!companyId) return;
    setBusy(true);
    try {
      await postAudit({ action: 'exit', companyId, proxyMeta: { route: window.location.pathname } });
    } finally {
      clearProxyCompanyFromStorage();
      router.push('/proxy');
      router.refresh();
      setBusy(false);
    }
  }

  const wrapClass = [sticky ? 'sticky top-14 z-40' : '', 'rounded-xl bg-white border border-black/5'].filter(Boolean).join(' ');

  if (variant === 'compact') {
    return (
      <div className={wrapClass}>
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs text-black/60">PROXY MODE · Acting as BBY.SG Pte Ltd</div>
            <div className="mt-0.5 text-sm font-semibold">
              {company.name} <span className="text-black/40 text-xs">({company.code})</span>
            </div>
          </div>
          <button
            disabled={busy}
            onClick={() => void exitProxy()}
            className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            退出 Proxy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <div className="p-4 border-b border-black/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm text-black/60">PROXY MODE · Acting as BBY.SG Pte Ltd</div>
          <div className="mt-1 text-lg font-semibold">
            {company.name} <span className="text-black/40 text-sm">({company.code})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={busy}
            onClick={() => void exitProxy()}
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
      </div>
    </div>
  );
}
