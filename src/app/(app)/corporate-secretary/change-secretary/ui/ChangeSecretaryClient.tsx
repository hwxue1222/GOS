'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

type NewSecretary = { fullName: string; email: string; phone: string };

export default function ChangeSecretaryClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const [addSecretaries, setAddSecretaries] = useState<NewSecretary[]>([{ fullName: '', email: '', phone: '' }]);
  const [removeSecretaryRoleId, setRemoveSecretaryRoleId] = useState('');
  const [useByBridgeSecretary, setUseByBridgeSecretary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const existing = useMemo(() => roles?.secretaries ?? [], [roles?.secretaries]);

  function patchSecretary(idx: number, patch: Partial<NewSecretary>) {
    setAddSecretaries((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function addRow() {
    setAddSecretaries((prev) => [...prev, { fullName: '', email: '', phone: '' }]);
  }

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    const cleanedAdd = addSecretaries
      .map((x) => ({
        fullName: x.fullName.trim(),
        email: x.email.trim(),
        phone: x.phone.trim(),
      }))
      .filter((x) => !!x.fullName);

    if (!removeSecretaryRoleId.trim() && cleanedAdd.length === 0) {
      setSubmitError('Please add or delete at least one secretary.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'CHANGE_SECRETARY',
          payload: {
            removeSecretaryRoleId: removeSecretaryRoleId.trim() || undefined,
            addSecretaries: cleanedAdd.map((x) => ({ fullName: x.fullName, email: x.email || undefined, phone: x.phone || undefined })),
            useByBridgeCompanySecretary: useByBridgeSecretary,
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
    <ModalShell title="Change of Secretary" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium text-black">New Addition Secretary Informations</div>
            <div className="mt-3 space-y-3">
              {addSecretaries.map((s, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <label className="sm:col-span-5 text-sm">
                    <div className="text-black/60">Full name</div>
                    <input
                      value={s.fullName}
                      onChange={(e) => patchSecretary(i, { fullName: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="sm:col-span-4 text-sm">
                    <div className="text-black/60">Email</div>
                    <input
                      value={s.email}
                      onChange={(e) => patchSecretary(i, { email: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="sm:col-span-3 text-sm">
                    <div className="text-black/60">Phone</div>
                    <input
                      value={s.phone}
                      onChange={(e) => patchSecretary(i, { phone: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={addRow} className="text-sm text-[#2f7bdc] hover:underline">
                Add
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-black">Delete Secretary</div>
            <select
              value={removeSecretaryRoleId}
              onChange={(e) => setRemoveSecretaryRoleId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Needed Delete Secretary</option>
              {existing.map((r) => (
                <option key={r.role.id} value={r.role.id}>
                  {r.entity.person.fullName}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeSecretary}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseByBridgeSecretary(checked);
                if (checked) {
                  setAddSecretaries([{ fullName: 'Bybridge Company Secretary', email: '', phone: '' }]);
                }
              }}
              className="h-4 w-4"
            />
            To use ByBridge company secretary
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

