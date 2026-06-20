'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { usePersistedState } from '@/lib/usePersistedState';

import RegisterCompanyStep1 from '@/app/(app)/incorporation/ui/register-company/RegisterCompanyStep1';
import RegisterCompanyStep2 from '@/app/(app)/incorporation/ui/register-company/RegisterCompanyStep2';
import RegisterCompanyStep3 from '@/app/(app)/incorporation/ui/register-company/RegisterCompanyStep3';

import type { RegisterCompanyDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';
import { joinCompanyName, normalizeDraftFromPayload } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';
import { validateStep1, validateStep2, validateStep3 } from '@/app/(app)/incorporation/ui/register-company/registerCompanyValidation';

import { normalizePhone } from '@/app/(app)/secretary/companies/[clientId]/ui/directorChangeFormUtils';

type Mode = 'create' | 'edit';

type Persisted = {
  step: 1 | 2 | 3;
  draft: RegisterCompanyDraft;
};

type Props = {
  mode: Mode;
  defaultCompanyName?: string;
  applicationId?: string;
  initialPayload?: Record<string, unknown>;
  canEdit?: boolean;
  onSaved?: () => void;
  onSubmitted?: () => void;
};

function bytesToBase64(bytes: ArrayBuffer) {
  const u8 = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export default function RegisterCompanyWizardClient(props: Props) {
  const router = useRouter();

  const storageKey = useMemo(() => {
    if (props.mode === 'edit') return `gos.inc.registerCompany.edit.${props.applicationId ?? 'unknown'}.v1`;
    return 'gos.inc.registerCompany.create.v1';
  }, [props.applicationId, props.mode]);

  const initialPersisted = useMemo<Persisted>(() => {
    const d = normalizeDraftFromPayload(props.initialPayload, props.defaultCompanyName);
    return { step: 1, draft: d };
  }, [props.defaultCompanyName, props.initialPayload]);

  const [persisted, setPersisted] = usePersistedState<Persisted>(storageKey, initialPersisted);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const draft = persisted.draft;
  const step = persisted.step;

  const step1Errors = useMemo(() => validateStep1(draft), [draft]);
  const step2Errors = useMemo(() => validateStep2(draft), [draft]);
  const step3Errors = useMemo(() => validateStep3(draft), [draft]);
  const allErrors = useMemo(() => [...step1Errors, ...step2Errors, ...step3Errors], [step1Errors, step2Errors, step3Errors]);

  const currentErrors = useMemo(() => {
    if (step === 1) return step1Errors;
    if (step === 2) return step2Errors;
    return allErrors;
  }, [allErrors, step, step1Errors, step2Errors]);

  const companyNameFull = useMemo(
    () => joinCompanyName(draft.step1.companyName, draft.step1.companySuffix),
    [draft.step1.companyName, draft.step1.companySuffix],
  );

  function patchStep(stepNo: 1 | 2 | 3) {
    if (stepNo === 3) {
      setShowValidation(true);
      if (step2Errors.length) {
        setPersisted({ ...persisted, step: 2 });
        return;
      }
    }
    setPersisted({ ...persisted, step: stepNo });
  }

  useEffect(() => {
    if (step === 3 && step2Errors.length) {
      setShowValidation(true);
      setPersisted((prev) => ({ ...prev, step: 2 }));
    }
  }, [step, step2Errors.length]);

  function setDraft(next: RegisterCompanyDraft) {
    setPersisted({ ...persisted, draft: next });
  }

  const canGoNext = step === 1 ? step1Errors.length === 0 : step === 2 ? step2Errors.length === 0 : allErrors.length === 0;

  function buildPayload(): Record<string, unknown> {
    return {
      companyName: companyNameFull,
      companySuffix: draft.step1.companySuffix,
      alternativeName: joinCompanyName(draft.step1.alternativeName, draft.step1.alternativeSuffix),
      alternativeSuffix: draft.step1.alternativeSuffix,
      paidUpCapitalCurrency: draft.step1.paidUpCapitalCurrency,
      paidUpCapitalAmount: draft.step1.paidUpCapitalAmount.trim(),
      totalShares: Number(draft.step1.totalShares.trim() || 0) || undefined,
      ssicPrimaryCode: draft.step1.ssicPrimaryCode.trim() || undefined,
      ssicSecondaryCode: draft.step1.ssicSecondaryCode.trim() || undefined,
      address: draft.step1.address.trim() || undefined,
      useByBridgeRegisteredOfficeAddress: draft.step1.useByBridgeRegisteredOfficeAddress,
      shareholders: draft.step2.shareholders.map((sh) => {
        if (sh.kind === 'PERSON') {
          return {
            kind: 'PERSON',
            shares: Number(sh.shares.trim() || 0) || 0,
            person: {
              fullName: sh.person.fullName.trim(),
              idTypeLabel: sh.person.idTypeLabel,
              idNo: sh.person.idNo.trim(),
              dob: sh.person.dob.trim() || undefined,
              email: sh.person.email.trim() || undefined,
              phone: normalizePhone(sh.person.phoneCountryCode, sh.person.phoneLocal) || undefined,
              nationality: sh.person.nationality.trim() || undefined,
              address: sh.person.address.trim() || undefined,
              lockedFromLookup: sh.person.lockedFromLookup,
            },
          };
        }
        return {
          kind: 'COMPANY',
          shares: Number(sh.shares.trim() || 0) || 0,
          company: {
            companyName: sh.company.companyName.trim(),
            registrationNo: sh.company.registrationNo.trim(),
            countryOfIncorporation: sh.company.countryOfIncorporation.trim() || undefined,
            address: sh.company.address.trim() || undefined,
            email: sh.company.email.trim() || undefined,
            phone: sh.company.phone.trim() || undefined,
            clientId: sh.company.clientId,
            lockedFromLookup: sh.company.lockedFromLookup,
          },
          contacts: {
            corporateRepresentativeName: sh.contacts.corporateRepresentativeName.trim() || undefined,
            corporateRepresentativeEmail: sh.contacts.corporateRepresentativeEmail.trim() || undefined,
            directorSignerName: sh.contacts.directorSignerName.trim() || undefined,
            directorSignerEmail: sh.contacts.directorSignerEmail.trim() || undefined,
          },
        };
      }),
      directors: draft.step2.directors.map((p) => ({
        fullName: p.fullName.trim(),
        idTypeLabel: p.idTypeLabel,
        idNo: p.idNo.trim(),
        dob: p.dob.trim() || undefined,
        email: p.email.trim() || undefined,
        phone: normalizePhone(p.phoneCountryCode, p.phoneLocal) || undefined,
        nationality: p.nationality.trim() || undefined,
        address: p.address.trim() || undefined,
        lockedFromLookup: p.lockedFromLookup,
      })),
      rorcControllers: draft.step2.rorcControllers.map((c) => ({
        person: {
          fullName: c.person.fullName.trim(),
          idTypeLabel: c.person.idTypeLabel,
          idNo: c.person.idNo.trim(),
          dob: c.person.dob.trim() || undefined,
          email: c.person.email.trim() || undefined,
          phone: normalizePhone(c.person.phoneCountryCode, c.person.phoneLocal) || undefined,
          nationality: c.person.nationality.trim() || undefined,
          address: c.person.address.trim() || undefined,
          lockedFromLookup: c.person.lockedFromLookup,
        },
        initiationAt: c.initiationAt.trim() || undefined,
      })),
      secretary: draft.step2.useByBridgeCompanySecretary
        ? { useByBridgeCompanySecretary: true }
        : {
            fullName: draft.step2.secretary.fullName.trim(),
            idTypeLabel: draft.step2.secretary.idTypeLabel,
            idNo: draft.step2.secretary.idNo.trim(),
            dob: draft.step2.secretary.dob.trim() || undefined,
            email: draft.step2.secretary.email.trim() || undefined,
            phone: normalizePhone(draft.step2.secretary.phoneCountryCode, draft.step2.secretary.phoneLocal) || undefined,
            nationality: draft.step2.secretary.nationality.trim() || undefined,
            address: draft.step2.secretary.address.trim() || undefined,
            lockedFromLookup: draft.step2.secretary.lockedFromLookup,
          },
      useByBridgeNomineeDirector: draft.step2.useByBridgeNomineeDirector,
      useByBridgeCompanySecretary: draft.step2.useByBridgeCompanySecretary,
      confirmations: {
        infoAccurate: draft.step3.confirmInfoAccurate,
        authorizedToSubmit: draft.step3.confirmAuthorizedToSubmit,
      },
    };
  }

  async function uploadFiles(applicationId: string) {
    for (const f of files) {
      const buf = await f.arrayBuffer();
      const dataBase64 = bytesToBase64(buf);
      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(applicationId)}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64 }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        throw new Error(j?.error ?? `UPLOAD_HTTP_${res?.status ?? 'NETWORK'}`);
      }
    }
  }

  async function save(submit: boolean) {
    setError(null);
    setBusy(true);
    try {
      const payload = buildPayload();

      if (props.mode === 'create') {
        const res = await fetch('/api/incorporation/applications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'REGISTER_COMPANY', companyName: companyNameFull, payload, submit }),
        }).catch(() => null);
        const j = (await res?.json().catch(() => null)) as { application?: { id: string }; error?: string } | null;
        if (!res?.ok || !j?.application?.id) {
          setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }
        const id = j.application.id;
        if (files.length) await uploadFiles(id);
        try {
          window.localStorage.removeItem(storageKey);
        } catch {}
        router.push(`/incorporation/applications/${encodeURIComponent(id)}`);
        router.refresh();
        return;
      }

      if (!props.applicationId) {
        setError('MISSING_APPLICATION_ID');
        return;
      }
      if (props.canEdit === false) {
        setError('LOCKED');
        return;
      }

      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(props.applicationId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyName: companyNameFull, payload }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res?.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }

      if (submit) {
        const res2 = await fetch(`/api/incorporation/applications/${encodeURIComponent(props.applicationId)}/submit`, { method: 'POST' }).catch(() => null);
        const j2 = (await res2?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res2?.ok || !j2?.ok) {
          setError(j2?.error ?? `HTTP_${res2?.status ?? 'NETWORK'}`);
          return;
        }
      }

      props.onSaved?.();
      if (submit) props.onSubmitted?.();
      router.refresh();
    } catch (e) {
      setError((e as Error).message || 'SAVE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  function onNext() {
    setShowValidation(true);
    if (step === 1 && step1Errors.length) return;
    if (step === 2 && step2Errors.length) return;
    patchStep((step + 1) as 1 | 2 | 3);
  }

  function onSubmit() {
    setShowValidation(true);
    if (allErrors.length) return;
    void save(true);
  }

  const stepLabels = ['Basic informations', 'Personal information', 'Information confirmed'] as const;
  const stepHasErrors = {
    1: step1Errors.length > 0,
    2: step2Errors.length > 0,
    3: step3Errors.length > 0,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {stepLabels.map((label, idx) => {
            const n = (idx + 1) as 1 | 2 | 3;
            const active = step === n;
            const done = step > n;
            const clickable = n <= step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => (clickable ? patchStep(n) : null)}
                className={'flex items-center gap-2 whitespace-nowrap ' + (clickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')}
              >
                <span
                  className={
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ' +
                    (done ? 'bg-[#2f7bdc] text-white' : active ? 'bg-[#2f7bdc] text-white' : 'bg-black/10 text-black/60')
                  }
                >
                  {done ? '✓' : String(n)}
                </span>
                <span className={active ? 'text-sm font-medium text-black' : 'text-sm text-black/50'}>{label}</span>
                {stepHasErrors[n] ? <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-red-500" /> : null}
                {idx < stepLabels.length - 1 ? <span className="mx-2 h-px w-8 bg-black/10" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {error ? <div className="rounded-xl bg-white border border-black/5 p-4 text-sm text-red-600">{error}</div> : null}

      <div className="rounded-xl bg-white border border-black/5 p-4 sm:p-6">
        {step === 1 ? (
          <RegisterCompanyStep1 value={draft.step1} onChange={(next) => setDraft({ ...draft, step1: next })} />
        ) : step === 2 ? (
          <RegisterCompanyStep2 value={draft.step2} totalShares={draft.step1.totalShares} onChange={(next) => setDraft({ ...draft, step2: next })} />
        ) : (
          <RegisterCompanyStep3
            draft={draft}
            companyNameFull={companyNameFull}
            files={props.mode === 'create' ? files : undefined}
            onChangeFiles={props.mode === 'create' ? (fl) => setFiles(fl) : undefined}
            value={draft.step3}
            onChange={(next) => setDraft({ ...draft, step3: next })}
          />
        )}
      </div>

      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-black/50">{props.mode === 'edit' ? `Application: ${props.applicationId ?? '-'}` : 'New application'}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy || step === 1}
              onClick={() => patchStep(((step - 1) as 1 | 2 | 3) || 1)}
              className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={busy || !companyNameFull.trim()}
              onClick={() => void save(false)}
              className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Save draft
            </button>
            {step < 3 ? (
              <button
                type="button"
                disabled={busy}
                onClick={onNext}
                className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onSubmit}
                className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </div>
        {showValidation && currentErrors.length ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="text-sm font-medium text-red-700">Please fix the following before continuing:</div>
            <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
              {currentErrors.slice(0, 6).map((e, i) => (
                <li key={`${e}-${i}`}>{e}</li>
              ))}
            </ul>
            {currentErrors.length > 6 ? <div className="mt-2 text-xs text-red-700">And {currentErrors.length - 6} more…</div> : null}
            {step === 3 && allErrors.length ? (
              <div className="mt-2 text-xs text-red-700">Total: {allErrors.length} issue(s)</div>
            ) : null}
          </div>
        ) : null}
        {step < 3 && !canGoNext && !showValidation ? <div className="mt-3 text-xs text-black/50">Some required fields are missing.</div> : null}
      </div>
    </div>
  );
}
