'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import ProxyContextBlockClient from '@/components/ProxyContextBlockClient';

export default function ModalShell(props: {
  title: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const [proxyCompanyId, setProxyCompanyId] = useState('');

  useEffect(() => {
    const pid = window.localStorage.getItem('gos.proxyCompanyId') ?? '';
    setProxyCompanyId(pid);
  }, []);

  const effectiveCloseHref = proxyCompanyId ? `/proxy/${encodeURIComponent(proxyCompanyId)}` : props.closeHref;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl overflow-hidden max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="p-4 border-b border-black/5 bg-white">
          <ProxyContextBlockClient variant="full" sticky={false} />
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 flex-none">
          <div className="text-base font-semibold text-black">{props.title}</div>
          <Link href={effectiveCloseHref} className="text-black/40 hover:text-black/70 px-2 py-1">
            ×
          </Link>
        </div>
        <div className="px-6 py-6 overflow-y-auto">{props.children}</div>
      </div>
    </div>
  );
}
