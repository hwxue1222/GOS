import {
  emptyPerson,
  emptyShareholder,
  normalizeDraftFromPayload,
  type RegisterCompanyDraft,
} from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';

import type { Currency } from '@/lib/types';

export type TransferSecretaryDraft = {
  step1: {
    companyName: string;
    companySuffix: string;
    companyRegistrationNo: string;
    paidUpCapitalAmount: string;
    paidUpCapitalCurrency: Currency;
    totalShares: string;
    ssicPrimaryCode: string;
    ssicSecondaryCode: string;
    address: string;
    useByBridgeRegisteredOfficeAddress: boolean;
  };
  step2: RegisterCompanyDraft['step2'];
  step3: RegisterCompanyDraft['step3'];
};

export function emptyTransferSecretaryDraft(): TransferSecretaryDraft {
  return {
    step1: {
      companyName: '',
      companySuffix: 'Pte Ltd',
      companyRegistrationNo: '',
      paidUpCapitalAmount: '',
      paidUpCapitalCurrency: 'SGD',
      totalShares: '',
      ssicPrimaryCode: '',
      ssicSecondaryCode: '',
      address: '',
      useByBridgeRegisteredOfficeAddress: false,
    },
    step2: {
      shareholders: [emptyShareholder()],
      directors: [emptyPerson()],
      rorcControllers: [{ id: emptyPerson().id, person: emptyPerson(), initiationAt: '' }],
      secretary: emptyPerson(),
      useByBridgeNomineeDirector: false,
      useByBridgeCompanySecretary: false,
    },
    step3: {
      confirmInfoAccurate: false,
      confirmAuthorizedToSubmit: false,
    },
  };
}

export function joinCompanyName(name: string, suffix: string) {
  const n = String(name ?? '').trim();
  const s = String(suffix ?? '').trim();
  if (!n) return '';
  if (!s) return n;
  return `${n} ${s}`;
}

export function normalizeTransferDraftFromPayload(payload?: Record<string, unknown>): TransferSecretaryDraft {
  const p = payload && typeof payload === 'object' ? payload : {};
  const draft = emptyTransferSecretaryDraft();
  const companyNameFull = typeof (p as any).companyName === 'string' ? String((p as any).companyName) : '';
  draft.step1.companyName = companyNameFull.replace(/\b(Pte\s+Ltd|Ltd|LLP|LP)\b\s*$/i, '').trim();
  draft.step1.companySuffix = typeof (p as any).companySuffix === 'string' ? String((p as any).companySuffix).trim() : draft.step1.companySuffix;
  draft.step1.companyRegistrationNo = typeof (p as any).companyRegistrationNo === 'string' ? String((p as any).companyRegistrationNo).trim() : '';
  draft.step1.paidUpCapitalAmount = typeof (p as any).paidUpCapitalAmount === 'string' ? String((p as any).paidUpCapitalAmount).trim() : '';
  draft.step1.paidUpCapitalCurrency = (typeof (p as any).paidUpCapitalCurrency === 'string' ? String((p as any).paidUpCapitalCurrency).trim().toUpperCase() : 'SGD') as any;
  draft.step1.totalShares = typeof (p as any).totalShares === 'number' ? String((p as any).totalShares) : typeof (p as any).totalShares === 'string' ? String((p as any).totalShares).trim() : '';
  draft.step1.ssicPrimaryCode = typeof (p as any).ssicPrimaryCode === 'string' ? String((p as any).ssicPrimaryCode).trim() : '';
  draft.step1.ssicSecondaryCode = typeof (p as any).ssicSecondaryCode === 'string' ? String((p as any).ssicSecondaryCode).trim() : '';
  draft.step1.address = typeof (p as any).address === 'string' ? String((p as any).address).trim() : '';
  draft.step1.useByBridgeRegisteredOfficeAddress = Boolean((p as any).useByBridgeRegisteredOfficeAddress);

  const registerDraft = normalizeDraftFromPayload(p as Record<string, unknown>);
  draft.step2 = registerDraft.step2;
  draft.step3 = registerDraft.step3;
  return draft;
}
