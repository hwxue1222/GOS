import type { PersonDraft, RegisterCompanyDraft, ShareholderDraft } from '@/app/(app)/incorporation/ui/register-company/registerCompanyDraft';

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isPositiveIntString(v: string) {
  if (!v.trim()) return false;
  if (!/^\d+$/.test(v.trim())) return false;
  return Number(v) > 0;
}

function normalizeText(v: string) {
  return v.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function validatePerson(p: PersonDraft) {
  const errors: string[] = [];
  if (!p.fullName.trim()) errors.push('Full name is required.');
  if (!p.idNo.trim()) errors.push(`${p.idTypeLabel} is required.`);
  if (!p.email.trim() || !isEmail(p.email)) errors.push('Valid email is required.');
  if (!p.dob.trim()) errors.push('Date of Birth is required.');
  if (!p.nationality.trim()) errors.push('Nationality is required.');
  if (!p.phoneLocal.trim()) errors.push('Phone is required.');
  if (!p.address.trim()) errors.push('Address is required.');
  return errors;
}

export function validateShareholder(sh: ShareholderDraft) {
  const e: string[] = [];
  if (!isPositiveIntString(sh.shares)) e.push('Number of Shares Held is required for each shareholder.');
  if (sh.kind === 'PERSON') return [...e, ...validatePerson(sh.person)];
  if (!sh.company.companyName.trim()) e.push('Shareholder company name is required.');
  if (!sh.company.registrationNo.trim()) e.push('Shareholder registration no is required.');
  if (!sh.company.address.trim()) e.push('Shareholder address is required.');
  if (!sh.company.email.trim() || !isEmail(sh.company.email)) e.push('Valid shareholder email is required.');
  if (!sh.contacts.corporateRepresentativeName.trim()) e.push('Corporate representative name is required.');
  if (!sh.contacts.corporateRepresentativeEmail.trim() || !isEmail(sh.contacts.corporateRepresentativeEmail)) {
    e.push('Valid corporate representative email is required.');
  }
  if (!sh.contacts.directorSignerName.trim()) e.push('Director/Secretary name is required.');
  if (!sh.contacts.directorSignerEmail.trim() || !isEmail(sh.contacts.directorSignerEmail)) {
    e.push('Valid director/secretary email is required.');
  }
  return e;
}

export function validateStep1(draft: RegisterCompanyDraft) {
  const e: string[] = [];
  if (!draft.step1.companyName.trim()) e.push('Company is required.');
  if (!draft.step1.alternativeName.trim()) e.push('Alternative Name is required.');
  if (
    draft.step1.companyName.trim() &&
    draft.step1.alternativeName.trim() &&
    normalizeText(draft.step1.companyName) === normalizeText(draft.step1.alternativeName)
  ) {
    e.push('Alternative Name cannot be the same as Company.');
  }
  if (!draft.step1.paidUpCapitalAmount.trim() || !/^\d+(?:\.\d+)?$/.test(draft.step1.paidUpCapitalAmount.trim())) {
    e.push('Registered Share Capital is required.');
  }
  if (!draft.step1.totalShares.trim() || !/^\d+$/.test(draft.step1.totalShares.trim())) e.push('Total Number Of Shares is required.');
  if (draft.step1.ssicSecondaryCode.trim() && draft.step1.ssicSecondaryCode.trim() === draft.step1.ssicPrimaryCode.trim()) {
    e.push('Activity 2 cannot be the same as Activity 1.');
  }
  if (!draft.step1.address.trim()) e.push('Company Address is required.');
  return e;
}

export function validateStep2(draft: RegisterCompanyDraft) {
  const e: string[] = [];
  if (!draft.step2.shareholders.length) e.push('At least 1 shareholder is required.');
  for (const sh of draft.step2.shareholders) e.push(...validateShareholder(sh));

  const totalSharesRaw = String(draft.step1.totalShares ?? '').trim();
  const totalShares = /^\d+$/.test(totalSharesRaw) ? Number(totalSharesRaw) : NaN;
  const shareholderShares = draft.step2.shareholders
    .map((s) => (isPositiveIntString(s.shares) ? Number(String(s.shares).trim()) : NaN))
    .filter((n) => Number.isFinite(n));
  const sumShares = shareholderShares.reduce((a, b) => a + b, 0);
  if (Number.isFinite(totalShares) && totalShares > 0 && shareholderShares.length === draft.step2.shareholders.length) {
    if (sumShares > totalShares) e.push('Total shares held by shareholders cannot exceed Total Number Of Shares.');
  }
  if (!draft.step2.directors.length) e.push('At least 1 director is required.');
  for (const d of draft.step2.directors) e.push(...validatePerson(d));
  if (!draft.step2.rorcControllers.length) e.push('At least 1 RORC controller is required.');
  for (const c of draft.step2.rorcControllers) {
    e.push(...validatePerson(c.person));
    if (!c.initiationAt.trim()) e.push('Initiation At is required.');
  }
  if (!draft.step2.useByBridgeCompanySecretary) e.push(...validatePerson(draft.step2.secretary));
  return e;
}

export function validateStep3(draft: RegisterCompanyDraft) {
  const e: string[] = [];
  if (!draft.step3.confirmInfoAccurate) e.push('Please confirm the information is true and correct.');
  if (!draft.step3.confirmAuthorizedToSubmit) e.push('Please confirm you are authorized to submit.');
  return e;
}
