'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import { DateInputYMD } from '@/components/DateInputYMD';

export default function TransferCompanySecretaryClient() {
  const router = useRouter();
  const { companyId, proxyCompanyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const [effectiveDate, setEffectiveDate] = useState('');
  const [newSecretaryName, setNewSecretaryName] = useState('');
  const [newSecretaryEmail, setNewSecretaryEmail] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitError(null);
    const nextName = newSecretaryName.trim();
    if (!companyId || !client || !nextName) {
      setSubmitError('Please fill all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(proxyCompanyId ? { 'x-gos-proxy-company-id': proxyCompanyId } : {}),
        },
        body: JSON.stringify({
          type: 'TRANSFER_COMPANY_SECRETARY',
          payload: {
            companyId,
            companyName: client.name,
            effectiveDate: effectiveDate.trim() || undefined,
            newSecretaryName: nextName,
            newSecretaryEmail: newSecretaryEmail.trim() || undefined,
            reason: reason.trim() || undefined,
            notes: notes.trim() || undefined,
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
    <ModalShell title="Transfer of Company Secretary" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div className="text-sm">
            <span className="text-black/60">Original Company :</span> <span className="text-black">{client.name}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <label className="sm:col-span-6 text-sm">
              <div className="text-black">Effective date (optional)</div>
              <DateInputYMD
                value={effectiveDate}
                onChange={setEffectiveDate}
                inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <div className="sm:col-span-6 text-sm">
              <div className="text-black">Current secretaries</div>
              <div className="mt-2 text-sm text-black/70">
                {roles?.secretaries?.length
                  ? roles.secretaries.map((s) => s.entity.person.fullName).join(', ')
                  : <span className="text-black/40">-</span>}
              </div>
            </div>

            <label className="sm:col-span-6 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> New Secretary Name :
              </div>
              <input
                value={newSecretaryName}
                onChange={(e) => setNewSecretaryName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="sm:col-span-6 text-sm">
              <div className="text-black">New Secretary Email (optional) :</div>
              <input
                value={newSecretaryEmail}
                onChange={(e) => setNewSecretaryEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="sm:col-span-12 text-sm">
              <div className="text-black">Reason (optional)</div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm min-h-[96px]"
              />
            </label>

            <label className="sm:col-span-12 text-sm">
              <div className="text-black">Notes (optional)</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm min-h-[96px]"
              />
            </label>
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
