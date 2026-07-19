'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import ProxyContextBlockClient from '@/components/ProxyContextBlockClient';

type Company = {
  id: string;
  code: string;
  name: string;
};

async function postAudit(input: { action: 'enter' | 'exit'; companyId: string; proxyMeta?: Record<string, unknown> }) {
  const res = await fetch('/api/proxy/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => null);
  if (!res?.ok) return;
}

export default function ProxyShellClient(props: { company: Company }) {
  useEffect(() => {
    window.sessionStorage.setItem('gos.currentCompanyId', props.company.id);
    window.sessionStorage.setItem('gos.proxyCompanyId', props.company.id);
    window.sessionStorage.setItem('gos.proxyCompanyName', props.company.name);
    window.sessionStorage.setItem('gos.proxyCompanyCode', props.company.code);
    window.localStorage.removeItem('gos.currentCompanyId');
    window.localStorage.removeItem('gos.proxyCompanyId');
    window.localStorage.removeItem('gos.proxyCompanyName');
    window.localStorage.removeItem('gos.proxyCompanyCode');
    void postAudit({ action: 'enter', companyId: props.company.id, proxyMeta: { route: `/proxy/${props.company.id}` } });
  }, [props.company.code, props.company.id, props.company.name]);

  return (
    <div className="mt-4">
      <ProxyContextBlockClient bootstrapCompany={props.company} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <div className="text-sm font-semibold text-black">Incorporation of Company</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/corporate-secretary/incorporation/register"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Register Company
            </Link>
            <Link
              href="/corporate-secretary/incorporation/transfer-secretary"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
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
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Change of Company Name
            </Link>
            <Link
              href="/corporate-secretary/change-address"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Change of Registerd Office Address
            </Link>
            <Link
              href="/corporate-secretary/change-business-activities"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Change of Activities
            </Link>
            <Link
              href="/corporate-secretary/change-fye"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Change of FYE
            </Link>
            <Link
              href="/corporate-secretary/change-secretary"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Change of Secretary
            </Link>
            <Link
              href="/corporate-secretary/rorc"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              RORC
            </Link>
            <Link
              href="/corporate-secretary/agm"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              AGM
            </Link>
            <Link
              href="/corporate-secretary/appoint-corporate-representative"
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Appointment of Corporate Representative
            </Link>
            <Link
              href={`/corporate-secretary/share-transfer?companyId=${encodeURIComponent(props.company.id)}`}
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Share Transfer
            </Link>
            <Link
              href={`/corporate-secretary/applications/new/director-change?companyId=${encodeURIComponent(props.company.id)}`}
              onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.company.id)}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Change of Director
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-4">
          <div className="text-sm font-semibold text-black">Applications Record</div>
          <div className="mt-1 text-sm text-black/50">View submitted applications for this company</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/secretary/acra-filing?companyId=${encodeURIComponent(props.company.id)}`}
              className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
            >
              Open ACRA Filing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
