import { newId } from '@/lib/id';

import type { Currency } from '@/lib/types';
import type { PhoneCountryCode } from '@/app/(app)/secretary/companies/[clientId]/ui/directorChangeFormUtils';
import { splitPhone } from '@/app/(app)/secretary/companies/[clientId]/ui/directorChangeFormUtils';

export type IdTypeLabel = 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.';

export type PersonDraft = {
  id: string;
  fullName: string;
  dob: string;
  nationality: string;
  phoneCountryCode: PhoneCountryCode;
  phoneLocal: string;
  idTypeLabel: IdTypeLabel;
  idNo: string;
  email: string;
  address: string;
  lockedFromLookup: boolean;
};

export type CompanyDraft = {
  companyName: string;
  registrationNo: string;
  countryOfIncorporation: string;
  address: string;
  email: string;
  phone: string;
  clientId?: string;
  lockedFromLookup: boolean;
};

export type ShareholderDraft =
  | {
      id: string;
      kind: 'PERSON';
      shares: string;
      person: PersonDraft;
    }
  | {
      id: string;
      kind: 'COMPANY';
      shares: string;
      company: CompanyDraft;
      contacts: {
        corporateRepresentativeName: string;
        corporateRepresentativeEmail: string;
        directorSignerName: string;
        directorSignerEmail: string;
      };
    };

export type RorcControllerDraft = {
  id: string;
  person: PersonDraft;
  initiationAt: string;
};

export type RegisterCompanyDraft = {
  step1: {
    companyName: string;
    companySuffix: string;
    alternativeName: string;
    alternativeSuffix: string;
    paidUpCapitalAmount: string;
    paidUpCapitalCurrency: Currency;
    totalShares: string;
    ssicPrimaryCode: string;
    ssicSecondaryCode: string;
    address: string;
    useByBridgeRegisteredOfficeAddress: boolean;
  };
  step2: {
    shareholders: ShareholderDraft[];
    directors: PersonDraft[];
    rorcControllers: RorcControllerDraft[];
    secretary: PersonDraft;
    useByBridgeNomineeDirector: boolean;
    useByBridgeCompanySecretary: boolean;
  };
  step3: {
    confirmInfoAccurate: boolean;
    confirmAuthorizedToSubmit: boolean;
  };
};

function safeString(v: unknown) {
  return typeof v === 'string' ? v : '';
}

function safeBool(v: unknown) {
  return typeof v === 'boolean' ? v : false;
}

function coerceCurrency(v: unknown): Currency {
  const s = safeString(v).trim().toUpperCase();
  if (s === 'SGD' || s === 'USD' || s === 'CNY' || s === 'MYR') return s;
  return 'SGD';
}

export function emptyPerson(): PersonDraft {
  return {
    id: newId('p'),
    fullName: '',
    dob: '',
    nationality: '',
    phoneCountryCode: '+65',
    phoneLocal: '',
    idTypeLabel: 'NRIC No.',
    idNo: '',
    email: '',
    address: '',
    lockedFromLookup: false,
  };
}

export function emptyShareholder(): ShareholderDraft {
  return { id: newId('sh'), kind: 'PERSON', shares: '', person: emptyPerson() };
}

export function emptyDraft(defaultCompanyName?: string): RegisterCompanyDraft {
  return {
    step1: {
      companyName: defaultCompanyName ?? '',
      companySuffix: 'Pte Ltd',
      alternativeName: '',
      alternativeSuffix: 'Pte Ltd',
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
      rorcControllers: [{ id: newId('rc'), person: emptyPerson(), initiationAt: '' }],
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

export function normalizePersonFromPayload(p: Record<string, unknown> | null): PersonDraft {
  const base = emptyPerson();
  const phone = safeString(p?.phone).trim();
  const split = splitPhone(phone);
  const idTypeLabel = ((): IdTypeLabel => {
    const s = safeString(p?.idTypeLabel).trim();
    if (s === 'Passport No.' || s === 'NRIC No.' || s === 'FIN No.' || s === 'IC No.') return s;
    return 'NRIC No.';
  })();
  return {
    ...base,
    fullName: safeString(p?.fullName).trim(),
    dob: safeString(p?.dob).trim(),
    nationality: safeString(p?.nationality).trim(),
    phoneCountryCode: split.phoneCountryCode,
    phoneLocal: split.phoneLocal,
    idTypeLabel,
    idNo: safeString(p?.idNo).trim(),
    email: safeString(p?.email).trim(),
    address: safeString(p?.address).trim(),
    lockedFromLookup: safeBool(p?.lockedFromLookup),
  };
}

export function normalizeDraftFromPayload(payload: Record<string, unknown> | undefined, defaultCompanyName?: string): RegisterCompanyDraft {
  const d = emptyDraft(defaultCompanyName);
  const p = payload ?? {};

  const legacyCompanyName = safeString(p.companyName).trim();
  if (legacyCompanyName) d.step1.companyName = legacyCompanyName;

  if (safeString(p.companySuffix).trim()) d.step1.companySuffix = safeString(p.companySuffix).trim();
  if (safeString(p.alternativeName).trim()) d.step1.alternativeName = safeString(p.alternativeName).trim();
  if (safeString(p.alternativeSuffix).trim()) d.step1.alternativeSuffix = safeString(p.alternativeSuffix).trim();
  if (safeString(p.paidUpCapitalAmount).trim()) d.step1.paidUpCapitalAmount = safeString(p.paidUpCapitalAmount).trim();
  d.step1.paidUpCapitalCurrency = coerceCurrency(p.paidUpCapitalCurrency);
  if (p.totalShares != null) d.step1.totalShares = String(p.totalShares);
  if (safeString(p.ssicPrimaryCode).trim()) d.step1.ssicPrimaryCode = safeString(p.ssicPrimaryCode).trim();
  if (safeString(p.ssicSecondaryCode).trim()) d.step1.ssicSecondaryCode = safeString(p.ssicSecondaryCode).trim();
  if (safeString(p.address).trim()) d.step1.address = safeString(p.address).trim();
  d.step1.useByBridgeRegisteredOfficeAddress = safeBool(p.useByBridgeRegisteredOfficeAddress);

  const shareholdersIn = Array.isArray(p.shareholders) ? (p.shareholders as unknown[]) : [];
  const normalizedShareholders: ShareholderDraft[] = [];
  for (const it of shareholdersIn) {
    const row = it && typeof it === 'object' ? (it as Record<string, unknown>) : null;
    const kind = safeString(row?.kind).trim().toUpperCase();
    const shares = row?.shares != null ? String(row.shares) : '';
    if (kind === 'COMPANY') {
      const c = row?.company && typeof row.company === 'object' ? (row.company as Record<string, unknown>) : {};
      const contacts = row?.contacts && typeof row.contacts === 'object' ? (row.contacts as Record<string, unknown>) : {};
      normalizedShareholders.push({
        id: newId('sh'),
        kind: 'COMPANY',
        shares,
        company: {
          companyName: safeString(c.companyName ?? c.name).trim(),
          registrationNo: safeString(c.registrationNo ?? c.companyRegistrationNo).trim(),
          countryOfIncorporation: safeString(c.countryOfIncorporation).trim(),
          address: safeString(c.address).trim(),
          email: safeString(c.email).trim(),
          phone: safeString(c.phone).trim(),
          clientId: safeString(c.clientId).trim() || undefined,
          lockedFromLookup: safeBool(c.lockedFromLookup),
        },
        contacts: {
          corporateRepresentativeName: safeString(contacts.corporateRepresentativeName).trim(),
          corporateRepresentativeEmail: safeString(contacts.corporateRepresentativeEmail).trim(),
          directorSignerName: safeString(contacts.directorSignerName).trim(),
          directorSignerEmail: safeString(contacts.directorSignerEmail).trim(),
        },
      });
    } else {
      const person = row?.person && typeof row.person === 'object' ? (row.person as Record<string, unknown>) : row;
      normalizedShareholders.push({ id: newId('sh'), kind: 'PERSON', shares, person: normalizePersonFromPayload(person) });
    }
  }
  if (normalizedShareholders.length) d.step2.shareholders = normalizedShareholders;

  const directorsIn = Array.isArray(p.directors) ? (p.directors as unknown[]) : [];
  const directors = directorsIn
    .map((x) => (x && typeof x === 'object' ? normalizePersonFromPayload(x as Record<string, unknown>) : null))
    .filter(Boolean) as PersonDraft[];
  if (directors.length) d.step2.directors = directors;

  const rorcIn = Array.isArray(p.rorcControllers) ? (p.rorcControllers as unknown[]) : [];
  const rorc = rorcIn
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const row = x as Record<string, unknown>;
      const person = row.person && typeof row.person === 'object' ? (row.person as Record<string, unknown>) : row;
      return { id: newId('rc'), person: normalizePersonFromPayload(person), initiationAt: safeString(row.initiationAt).trim() };
    })
    .filter(Boolean) as RorcControllerDraft[];
  if (rorc.length) d.step2.rorcControllers = rorc;

  const secIn = p.secretary && typeof p.secretary === 'object' ? (p.secretary as Record<string, unknown>) : null;
  if (secIn) d.step2.secretary = normalizePersonFromPayload(secIn);

  d.step2.useByBridgeNomineeDirector = safeBool(p.useByBridgeNomineeDirector);
  d.step2.useByBridgeCompanySecretary = safeBool(p.useByBridgeCompanySecretary);

  const conf = p.confirmations && typeof p.confirmations === 'object' ? (p.confirmations as Record<string, unknown>) : null;
  if (conf) {
    d.step3.confirmInfoAccurate = safeBool(conf.infoAccurate);
    d.step3.confirmAuthorizedToSubmit = safeBool(conf.authorizedToSubmit);
  }

  return d;
}

export function joinCompanyName(name: string, suffix: string) {
  const n = name.trim();
  const s = suffix.trim();
  if (!n) return '';
  if (!s) return n;
  const normalized = n.toLowerCase();
  if (normalized.endsWith(` ${s.toLowerCase()}`)) return n;
  return `${n} ${s}`;
}

