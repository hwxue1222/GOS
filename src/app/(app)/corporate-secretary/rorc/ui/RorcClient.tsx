'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

type NewController = { fullName: string; email: string };

export default function RorcClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const existing = useMemo(() => roles?.rorc ?? [], [roles?.rorc]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [message, setMessage] = useState('');
  const [removeRoleIds, setRemoveRoleIds] = useState<Record<string, boolean>>({});
  const [addControllers, setAddControllers] = useState<NewController[]>([{ fullName: '', email: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function patchController(idx: number, patch: Partial<NewController>) {
    setAddControllers((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function addRow() {
    setAddControllers((prev) => [...prev, { fullName: '', email: '' }]);
  }

  function toggleRemove(roleId: string, checked: boolean) {
    setRemoveRoleIds((prev) => ({ ...prev, [roleId]: checked }));
  }

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    const cleanedAdd = addControllers
      .map((x) => ({ fullName: x.fullName.trim(), email: x.email.trim() }))
      .filter((x) => !!x.fullName)
      .map((x) => ({ fullName: x.fullName, email: x.email || undefined }));
    const removeRorcRoleIds = Object.entries(removeRoleIds)
      .filter(([, v]) => !!v)
      .map(([k]) => k);

    const eff = effectiveDate.trim();
    if (!eff) {
      setSubmitError('Please select an effective date.');
      return;
    }
    if (!removeRorcRoleIds.length && cleanedAdd.length === 0) {
      setSubmitError('Please add or delete at least one controller.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/rorc-declaration-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          effectiveDate: eff,
          message: message.trim() || undefined,
          removeRorcRoleIds,
          addControllers: cleanedAdd,
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      router.push(`/corporate-secretary/applications/rorc/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Declaration of Company Controller (RORC)" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <label className="text-sm">
            <div className="text-black">
              <span className="text-red-500">*</span> Effective date
            </div>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <div className="text-black/60">Message (optional)</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>

          <div>
            <div className="text-sm font-medium text-black">Delete controllers</div>
            <div className="mt-2 rounded-lg border border-black/10 overflow-hidden">
              {existing.length ? (
                <div className="divide-y divide-black/5">
                  {existing.map((r) => {
                    const label = r.entity.type === 'PERSON' ? r.entity.person.fullName : r.entity.company.name;
                    const checked = !!removeRoleIds[r.role.id];
                    return (
                      <label key={r.role.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleRemove(r.role.id, e.target.checked)}
                          className="h-4 w-4"
                        />
                        <div className="min-w-0 truncate">{label}</div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-3 text-sm text-black/50">No controllers</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-black">New addition controllers</div>
            <div className="mt-3 space-y-3">
              {addControllers.map((c, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <label className="sm:col-span-7 text-sm">
                    <div className="text-black/60">Full name</div>
                    <input
                      value={c.fullName}
                      onChange={(e) => patchController(i, { fullName: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="sm:col-span-5 text-sm">
                    <div className="text-black/60">Email</div>
                    <input
                      value={c.email}
                      onChange={(e) => patchController(i, { email: e.target.value })}
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

