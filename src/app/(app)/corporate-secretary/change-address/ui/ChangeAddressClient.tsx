'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

export default function ChangeAddressClient() {
  const bbyRegisteredOfficeAddress = '8 Burn Road#15-03 Trivex Singapore 369977';
  const router = useRouter();
  const { companyId, proxyCompanyId, client, loading, error, closeHref } = useCompanyContext();
  const isProxyingThisCompany = !!proxyCompanyId && !!companyId && proxyCompanyId === companyId;
  const prevManualAddressRef = useRef<string>('');

  const [newAddress, setNewAddress] = useState('');
  const [useByBridgeAddress, setUseByBridgeAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitError(null);
    const value = newAddress.trim();
    if (!companyId || !client || !value) {
      setSubmitError('Please fill the required field.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(isProxyingThisCompany ? { 'x-gos-proxy-company-id': proxyCompanyId } : {}),
        },
        body: JSON.stringify({
          type: 'CHANGE_REGISTERED_OFFICE_ADDRESS',
          payload: {
            originalRegisteredOfficeAddress: client.registeredOfficeAddress ?? '',
            newRegisteredOfficeAddress: value,
            useByBridgeRegisteredOfficeAddress: useByBridgeAddress,
          },
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      router.push(`/corporate-secretary/applications/company-update/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Change of Registered Office Address" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div className="text-sm">
            <span className="text-black/60">Original Company Address :</span> <span className="text-black">{client.registeredOfficeAddress ?? '-'}</span>
          </div>

          <label className="text-sm">
            <div className="text-black">
              <span className="text-red-500">*</span> New Company Address :
            </div>
            <textarea
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              disabled={useByBridgeAddress}
              rows={5}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeAddress}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  if (newAddress.trim() && newAddress.trim() !== bbyRegisteredOfficeAddress) prevManualAddressRef.current = newAddress;
                  setUseByBridgeAddress(true);
                  setNewAddress(bbyRegisteredOfficeAddress);
                } else {
                  setUseByBridgeAddress(false);
                  if (newAddress.trim() === bbyRegisteredOfficeAddress) setNewAddress(prevManualAddressRef.current || '');
                }
              }}
              className="h-4 w-4"
            />
            To use BBY registered office address
          </label>

          <button
            disabled={submitting}
            onClick={() => void onSubmit()}
            className="w-full rounded-lg bg-[#2f7bdc] text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            Apply
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
