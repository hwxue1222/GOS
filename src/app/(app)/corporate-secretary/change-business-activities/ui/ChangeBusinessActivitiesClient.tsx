'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import SsicCombobox from '@/app/(app)/secretary/companies/[clientId]/ui/SsicCombobox';

export default function ChangeBusinessActivitiesClient() {
  const router = useRouter();
  const { companyId, client, loading, error, closeHref } = useCompanyContext();

  const [primary, setPrimary] = useState<string | undefined>(undefined);
  const [secondary, setSecondary] = useState<string | undefined>(undefined);
  const [removeSecondary, setRemoveSecondary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [originalPrimaryDesc, setOriginalPrimaryDesc] = useState<string>('');
  const [originalSecondaryDesc, setOriginalSecondaryDesc] = useState<string>('');

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!client) return;
      const p = String(client.ssicPrimaryCode ?? '').trim();
      const s = String(client.ssicSecondaryCode ?? '').trim();

      async function fetchDesc(code: string) {
        if (!code) return '';
        const res = await fetch(`/api/ssic?code=${encodeURIComponent(code)}`).catch(() => null);
        const j = (await res?.json().catch(() => null)) as { ok: boolean; item?: { description?: string } | null } | null;
        if (!res?.ok || !j?.ok) return '';
        return String(j.item?.description ?? '').trim();
      }

      const [pd, sd] = await Promise.all([fetchDesc(p), fetchDesc(s)]);
      if (ignore) return;
      setOriginalPrimaryDesc(pd);
      setOriginalSecondaryDesc(sd);
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [client]);

  useEffect(() => {
    if (!client) return;
    const p = String(client.ssicPrimaryCode ?? '').trim();
    const s = String(client.ssicSecondaryCode ?? '').trim();
    setPrimary(p || undefined);
    setSecondary(s || undefined);
    setRemoveSecondary(false);
  }, [client?.id]);

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }
    const ssicPrimaryCode = (primary ?? '').trim();
    const ssicSecondaryCode = (secondary ?? '').trim();
    if (!ssicPrimaryCode) {
      setSubmitError('Please select New Activity 1.');
      return;
    }
    if (ssicSecondaryCode && ssicSecondaryCode === ssicPrimaryCode) {
      setSubmitError('Activity 2 cannot be same as Activity 1.');
      return;
    }

    const originalPrimary = String(client.ssicPrimaryCode ?? '').trim();
    const originalSecondary = String(client.ssicSecondaryCode ?? '').trim();
    const resolvedPrimary = ssicPrimaryCode;
    const resolvedSecondary = removeSecondary ? '' : ssicSecondaryCode;
    if (resolvedPrimary === originalPrimary && resolvedSecondary === originalSecondary) {
      setSubmitError('No changes detected.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'CHANGE_BUSINESS_ACTIVITIES',
          payload: {
            ssicPrimaryCode: ssicPrimaryCode || undefined,
            ssicSecondaryCode: removeSecondary ? null : ssicSecondaryCode || undefined,
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
    <ModalShell title="Change of Business Activities" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-black/60">Original Activity 1:</span>{' '}
              <span className="text-black">{client.ssicPrimaryCode ?? '-'}</span>
              {originalPrimaryDesc ? <span className="text-black/50"> — {originalPrimaryDesc}</span> : null}
            </div>
            <div>
              <span className="text-black/60">Original Activity 2:</span>{' '}
              <span className="text-black">{client.ssicSecondaryCode ?? '-'}</span>
              {originalSecondaryDesc ? <span className="text-black/50"> — {originalSecondaryDesc}</span> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-12">
              <div className="text-sm text-black">
                <span className="text-red-500">*</span> New Activity 1 (or Activity 2) :
              </div>
              <div className="mt-1">
                <SsicCombobox label="" value={primary} onChange={setPrimary} excludeCode={secondary} />
              </div>
            </div>
            <div className="sm:col-span-12">
              <div className="text-sm text-black">New Activity 2 :</div>
              <label className="mt-2 inline-flex items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={removeSecondary}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRemoveSecondary(checked);
                    if (checked) setSecondary(undefined);
                    else setSecondary(String(client.ssicSecondaryCode ?? '').trim() || undefined);
                  }}
                />
                Remove Activity 2
              </label>
              {!removeSecondary ? (
                <div className="mt-2">
                  <SsicCombobox label="" value={secondary} onChange={setSecondary} excludeCode={primary} />
                </div>
              ) : (
                <div className="mt-2 text-xs text-black/50">Activity 2 will be removed after approval.</div>
              )}
            </div>
          </div>

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
