'use client';

import Link from 'next/link';

export default function PortalCorporateSecretaryServicesClient(props: { clientId: string }) {
  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="text-sm font-semibold">Corporate Secretary Services</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/corporate-secretary/appoint-corporate-representative"
          onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.clientId)}
          className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
        >
          Appointment of Corporate Representative
        </Link>
      </div>
    </div>
  );
}

