'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import DirectorRowFields from '@/app/(app)/secretary/companies/[clientId]/ui/DirectorRowFields';
import {
  draftKey,
  isEmail,
  isYmd,
  isYmdWithinPastDays,
  normalizePhone,
  splitPhone,
  type NewDirector,
  ymdToday,
} from '@/app/(app)/secretary/companies/[clientId]/ui/directorChangeFormUtils';

type Props = {
  clientId: string;
  directors: Array<{ roleId: string; fullName: string; email?: string }>;
};

export default function DirectorChangeRequestForm({ clientId, directors }: Props) {
  const router = useRouter();
  const [effectiveDate, setEffectiveDate] = useState(() => ymdToday());
  const [message, setMessage] = useState('');
  const [removeRoleIds, setRemoveRoleIds] = useState<string[]>([]);
  const [useByBridgeNomineeDirector, setUseByBridgeNomineeDirector] = useState(false);
  const [addDirectors, setAddDirectors] = useState<NewDirector[]>([]);
  const [editing, setEditing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showErrorsByIdx, setShowErrorsByIdx] = useState<Record<number, boolean>>({});
  const lookupSeqByIdxRef = useRef(new Map<number, number>());
  const lookupTimerByIdxRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const validateDirector = (s: NewDirector) => {
    const fullName = s.fullName.trim();
    const idNo = s.idNo.trim();
    const email = s.email.trim();
    const dob = s.dob.trim();
    const nationality = s.nationality.trim();
    const address = s.address.trim();
    const phone = normalizePhone(s.phoneCountryCode, s.phoneLocal);
    const missing = {
      fullName: !fullName,
      idNo: !idNo,
      email: !email,
      dob: !dob,
      nationality: !nationality,
      address: !address,
      phone: !phone,
    };
    const invalid = {
      email: !!email && !isEmail(email),
    };
    const ok = !Object.values(missing).some(Boolean);
    return { ok: ok && !Object.values(invalid).some(Boolean), missing, invalid };
  };

  function patchDirector(idx: number, patch: Partial<NewDirector>) {
    setAddDirectors((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function addRow() {
    const lastIdx = addDirectors.length ? addDirectors.length - 1 : -1;
    if (lastIdx >= 0) {
      const v = validateDirector(addDirectors[lastIdx]);
      if (!v.ok) {
        setShowErrorsByIdx((prev) => ({ ...prev, [lastIdx]: true }));
        setSubmitError(`Please complete all required fields for Director ${lastIdx + 1} before adding next.`);
        return;
      }
    }
    setEditing(true);
    setSubmitError(null);
    setAddDirectors((prev) => [
      ...prev,
      {
        fullName: '',
        email: '',
        idTypeLabel: 'NRIC No.',
        idNo: '',
        nationality: 'Singapore',
        dob: '',
        dobLocked: false,
        phoneCountryCode: '+65',
        phoneLocal: '',
        address: '',
        lockedFromMember: false,
      },
    ]);
  }

  function deleteRow(idx: number) {
    setAddDirectors((prev) => prev.filter((_, i) => i !== idx));
    setShowErrorsByIdx((prev) => {
      const next: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k);
        if (!Number.isFinite(i) || i === idx) continue;
        next[i > idx ? i - 1 : i] = v;
      }
      return next;
    });
  }

  async function lookupMemberByIdNo(idx: number, idNoRaw: string) {
    const idNo = String(idNoRaw ?? '').trim();
    if (!idNo) return;

    const seq = (lookupSeqByIdxRef.current.get(idx) ?? 0) + 1;
    lookupSeqByIdxRef.current.set(idx, seq);

    const res = await fetch(`/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}`).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | {
          ok: true;
          person: { fullName?: string; email?: string; phone?: string; nationality?: string; dob?: string; address?: string; idNo?: string };
        }
      | { ok: true; person: null }
      | { ok: false; error?: string }
      | null;

    if ((lookupSeqByIdxRef.current.get(idx) ?? 0) !== seq) return;
    if (!res?.ok || !json || !('ok' in json) || !json.ok) return;
    if (!('person' in json) || !json.person) return;

    const p = json.person;
    const phone = splitPhone(String(p.phone ?? ''));
    const patch: Partial<NewDirector> = {
      fullName: String(p.fullName ?? '').trim(),
      email: String(p.email ?? '').trim(),
      nationality: String(p.nationality ?? '').trim() || 'Singapore',
      address: String(p.address ?? '').trim(),
      phoneCountryCode: phone.phoneCountryCode,
      phoneLocal: phone.phoneLocal,
      lockedFromMember: true,
    };
    const dob = String(p.dob ?? '').trim();
    if (dob && isYmd(dob)) {
      patch.dob = dob;
      patch.dobLocked = true;
    } else {
      patch.dobLocked = false;
    }
    patchDirector(idx, patch);
    setShowErrorsByIdx((prev) => ({ ...prev, [idx]: false }));
  }

  useEffect(() => {
    if (!clientId) return;
    const raw = window.localStorage.getItem(draftKey(clientId));
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as {
        effectiveDate?: string;
        message?: string;
        useByBridgeNomineeDirector?: boolean;
        removeDirectorRoleIds?: string[];
        addDirectors?: NewDirector[];
      };
      if (typeof d.effectiveDate === 'string') setEffectiveDate(d.effectiveDate);
      if (typeof d.message === 'string') setMessage(d.message);
      if (typeof d.useByBridgeNomineeDirector === 'boolean') setUseByBridgeNomineeDirector(d.useByBridgeNomineeDirector);
      if (Array.isArray(d.removeDirectorRoleIds)) setRemoveRoleIds(d.removeDirectorRoleIds);
      if (Array.isArray(d.addDirectors)) setAddDirectors(d.addDirectors);
      setEditing(false);
    } catch {
      window.localStorage.removeItem(draftKey(clientId));
    }
  }, [clientId]);

  const canApply = useMemo(() => {
    const hasAdds = addDirectors.some((r) => r.fullName.trim());
    const hasRemoves = removeRoleIds.length > 0;
    return !!effectiveDate.trim() && (useByBridgeNomineeDirector || hasAdds || hasRemoves);
  }, [addDirectors, effectiveDate, removeRoleIds.length, useByBridgeNomineeDirector]);

  async function onSave() {
    setSubmitError(null);
    const invalidIdx: number[] = [];
    addDirectors.forEach((s, idx) => {
      const v = validateDirector(s);
      if (!v.ok) invalidIdx.push(idx);
    });
    if (invalidIdx.length) {
      setShowErrorsByIdx((prev) => {
        const next = { ...prev };
        for (const idx of invalidIdx) next[idx] = true;
        return next;
      });
      setSubmitError('Please complete all required fields for new director.');
      return;
    }
    if (effectiveDate.trim() && !isYmdWithinPastDays(effectiveDate.trim(), 14)) {
      setSubmitError('Effective date must be within the past 14 days and not in the future.');
      return;
    }

    setSubmitting(true);
    try {
      window.localStorage.setItem(
        draftKey(clientId),
        JSON.stringify({
          effectiveDate,
          message,
          useByBridgeNomineeDirector,
          removeDirectorRoleIds: removeRoleIds,
          addDirectors,
          savedAt: new Date().toISOString(),
        }),
      );
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function onApply() {
    setSubmitError(null);
    const hasAdd = addDirectors.length > 0;
    if (!useByBridgeNomineeDirector && !hasAdd && !removeRoleIds.length) {
      setSubmitError('Please add or remove at least one director.');
      return;
    }
    if (!effectiveDate.trim() || !isYmdWithinPastDays(effectiveDate.trim(), 14)) {
      setSubmitError('Effective date must be within the past 14 days and not in the future.');
      return;
    }

    const cleanedAdd = addDirectors
      .map((x) => ({
        fullName: x.fullName.trim(),
        email: x.email.trim().toLowerCase(),
        phone: normalizePhone(x.phoneCountryCode, x.phoneLocal),
        dob: x.dob.trim(),
        nationality: x.nationality.trim(),
        idNo: x.idNo.trim(),
        idTypeLabel: x.idTypeLabel,
        address: x.address.trim(),
      }))
      .filter((x) => !!x.fullName);

    for (const d of cleanedAdd) {
      if (!d.fullName || !d.email || !d.idNo || !d.dob || !d.nationality || !d.phone || !d.address) {
        setSubmitError('Please complete all required fields for new director.');
        return;
      }
      if (!isEmail(d.email)) {
        setSubmitError('Please provide a valid email for new director.');
        return;
      }
      if (!isYmd(d.dob)) {
        setSubmitError('Date of birth must be a valid date (YYYY-MM-DD).');
        return;
      }
    }

    const emailSet = new Set<string>();
    for (const d of cleanedAdd) {
      if (emailSet.has(d.email)) {
        setSubmitError('New directors email must be unique.');
        return;
      }
      emailSet.add(d.email);
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(clientId)}/director-change-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          effectiveDate: effectiveDate.trim(),
          message: message.trim() || undefined,
          useByBridgeNomineeDirector,
          removeDirectorRoleIds: removeRoleIds,
          addDirectors: cleanedAdd,
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as
        | { ok: true; request: { id: string }; signLinks?: Array<{ email: string; url: string }> }
        | { ok: false; error?: string }
        | null;
      if (!res?.ok || !j || !('ok' in j) || !j.ok || !j.request?.id) {
        setSubmitError((j as any)?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }

      const signLinksText = Array.isArray(j.signLinks)
        ? (j.signLinks as Array<{ email: string; url: string }>).map((x) => `${x.email} — ${x.url}`).join('\n')
        : null;
      window.localStorage.removeItem(draftKey(clientId));
      router.push(`/corporate-secretary/applications/director-change/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}
      <div className="text-sm font-medium">Change of Director</div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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
        <div className="text-sm">
          <div className="text-black">Resignation of director</div>
          <div className="mt-2 space-y-1">
            {directors.length ? (
              directors.map((d) => {
                const checked = removeRoleIds.includes(d.roleId);
                return (
                  <label key={d.roleId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setRemoveRoleIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.roleId);
                          else next.delete(d.roleId);
                          return Array.from(next);
                        })
                      }
                      className="h-4 w-4"
                    />
                    <span className="text-black/70">{d.fullName}</span>
                    {d.email ? <span className="text-xs text-black/40">{d.email}</span> : null}
                  </label>
                );
              })
            ) : (
              <div className="text-xs text-black/50">No directors</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-black">New director appointed</div>
          <button
            type="button"
            onClick={() => {
              if (!editing && (addDirectors.length || removeRoleIds.length || useByBridgeNomineeDirector)) {
                setSubmitError(null);
                setEditing(true);
                return;
              }
              addRow();
            }}
            className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.02]"
          >
            Add
          </button>
        </div>

        {!editing && addDirectors.length ? (
          <div className="mt-2 text-xs text-black/50">Saved new director: {addDirectors.map((s) => s.fullName.trim()).filter(Boolean).join(', ') || '-'}</div>
        ) : null}
        {!editing && useByBridgeNomineeDirector ? (
          <div className="mt-2 text-xs text-black/50">ByBridge nominee director: Xue Hongwei (NRIC No. S7864540G)</div>
        ) : null}

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useByBridgeNomineeDirector}
            onChange={(e) => {
              setUseByBridgeNomineeDirector(e.target.checked);
              setSubmitError(null);
            }}
            className="h-4 w-4"
          />
          To use ByBridge nominee director service
        </label>

        {editing ? (
          <div className="mt-4 space-y-6">
            {addDirectors.map((d, i) => (
              <div key={i}>
                {i > 0 ? <div className="my-4 border-t border-dashed border-black/20" /> : null}
                <DirectorRowFields
                  idx={i}
                  value={d}
                  showErrors={!!showErrorsByIdx[i]}
                  canDelete={!submitting && addDirectors.length > 0}
                  onDelete={() => deleteRow(i)}
                  onPatch={(patch) => patchDirector(i, patch)}
                  onIdNoInput={(next, wasLocked) => {
                    patchDirector(i, {
                      idNo: next,
                      ...(wasLocked
                        ? {
                            lockedFromMember: false,
                            fullName: '',
                            email: '',
                            phoneLocal: '',
                            dob: '',
                            dobLocked: false,
                            nationality: 'Singapore',
                            address: '',
                          }
                        : {}),
                    });
                    const t = lookupTimerByIdxRef.current.get(i);
                    if (t) clearTimeout(t);
                    lookupTimerByIdxRef.current.set(
                      i,
                      setTimeout(() => {
                        void lookupMemberByIdNo(i, next);
                      }, 350),
                    );
                  }}
                  validate={(s) => validateDirector(s)}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="text-black text-sm">Message (optional)</div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" rows={3} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={submitting}
          className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => void onApply()}
          disabled={!canApply || submitting}
          className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {submitting ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </div>
  );
}
