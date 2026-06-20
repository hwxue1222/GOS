import type { TransferSecretaryDraft } from '@/app/(app)/incorporation/ui/transfer-secretary/transferSecretaryDraft';
import { validateStep2 as validateRegisterStep2, validateStep3 as validateRegisterStep3 } from '@/app/(app)/incorporation/ui/register-company/registerCompanyValidation';

function normalizeText(v: string) {
  return v.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function validateStep1(draft: TransferSecretaryDraft) {
  const e: string[] = [];
  if (!draft.step1.companyName.trim()) e.push('Company is required.');
  if (!draft.step1.companyRegistrationNo.trim()) e.push('Register Number is required.');
  if (!draft.step1.paidUpCapitalAmount.trim() || !/^\d+(?:\.\d+)?$/.test(draft.step1.paidUpCapitalAmount.trim())) {
    e.push('Registered Share Capital is required.');
  }
  if (!draft.step1.totalShares.trim() || !/^\d+$/.test(draft.step1.totalShares.trim())) e.push('Total Number Of Shares is required.');
  if (!draft.step1.ssicPrimaryCode.trim()) e.push('Activity 1 is required.');
  if (draft.step1.ssicSecondaryCode.trim() && normalizeText(draft.step1.ssicSecondaryCode) === normalizeText(draft.step1.ssicPrimaryCode)) {
    e.push('Activity 2 cannot be the same as Activity 1.');
  }
  if (!draft.step1.address.trim()) e.push('Company Address is required.');
  return e;
}

export function validateStep2(draft: TransferSecretaryDraft) {
  const fakeRegisterDraft = { step1: { totalShares: draft.step1.totalShares }, step2: draft.step2, step3: draft.step3 } as any;
  return validateRegisterStep2(fakeRegisterDraft);
}

export function validateStep3(draft: TransferSecretaryDraft) {
  const fakeRegisterDraft = { step1: { totalShares: draft.step1.totalShares }, step2: draft.step2, step3: draft.step3 } as any;
  return validateRegisterStep3(fakeRegisterDraft);
}

