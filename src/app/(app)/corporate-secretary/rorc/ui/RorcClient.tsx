'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import CountryOfIncorporationSelect from '@/components/CountryOfIncorporationSelect';

type IdType = 'PASSPORT' | 'NRIC' | 'FIN' | 'IC' | 'OTHER';

const ID_TYPE_LABEL_BY_VALUE: Record<string, string> = {
  PASSPORT: 'passport no',
  NRIC: 'nric no',
  FIN: 'fin no',
  IC: 'ic no',
  OTHER: 'id no',
};

function isSingaporeCompanyRegistrationNo(regNo: string) {
  return /^\d{9}[A-Za-z]$/.test(String(regNo ?? '').trim());
}

type SavedDraft = {
  person?: {
    effectiveDate?: string;
    fullName?: string;
    idType?: IdType;
    idNo?: string;
    dateOfBirth?: string;
    email?: string;
    nationality?: string;
    phone?: string;
    address?: string;
    ccEnabled?: boolean;
    ccName?: string;
    ccTitle?: string;
    ccPhone?: string;
    ccEmailAddress?: string;
  };
  company?: {
    effectiveDate?: string;
    companyName?: string;
    registerNumber?: string;
    countryOfIncorporation?: string;
    legalForm?: string;
    governedByLawAndJurisdiction?: string;
    registerOfCompanies?: string;
    companyAddress?: string;
    ccEnabled?: boolean;
    ccName?: string;
    ccTitle?: string;
    ccPhone?: string;
    ccEmailAddress?: string;
  };
};

function maskKeepStartEnd(raw: string, startKeep: number, endKeep: number) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.length <= startKeep + endKeep) return `${s.slice(0, Math.max(1, startKeep))}${'*'.repeat(Math.max(2, s.length - Math.max(1, startKeep)))}`;
  const mid = '*'.repeat(Math.max(3, s.length - startKeep - endKeep));
  return `${s.slice(0, startKeep)}${mid}${s.slice(s.length - endKeep)}`;
}

function maskEmail(raw: string) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at <= 0) return maskKeepStartEnd(s, 2, 1);
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const localMasked = local.length <= 2 ? `${local[0] ?? ''}***` : `${local.slice(0, 2)}***`;
  const domainParts = domain.split('.');
  const first = domainParts[0] ?? '';
  const rest = domainParts.slice(1).join('.')
  const domainMasked = first ? `${maskKeepStartEnd(first, 1, 1)}${rest ? `.${rest}` : ''}` : domain;
  return `${localMasked}@${domainMasked}`;
}

function maskPhone(raw: string) {
  const s = String(raw ?? '').replace(/\s+/g, '').trim();
  if (!s) return '';
  const keep = 4;
  if (s.length <= keep) return '*'.repeat(Math.max(3, s.length));
  return `${'*'.repeat(Math.max(3, s.length - keep))}${s.slice(-keep)}`;
}

function maskDateYmd(raw: string) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s ? maskKeepStartEnd(s, 0, 4) : '';
  return `**/**/${m[1]}`;
}

function readSavedDraft(key: string): SavedDraft {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedDraft;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSavedDraft(key: string, value: SavedDraft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export default function RorcClient() {
  const router = useRouter();
  const { companyId, client, loading, error, closeHref } = useCompanyContext();

  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [mode, setMode] = useState<'PERSON' | 'COMPANY'>('PERSON');
  const [effectiveDate, setEffectiveDate] = useState(todayYmd);

  const [personLockedFromLookup, setPersonLockedFromLookup] = useState(false);
  const [companyLockedFromLookup, setCompanyLockedFromLookup] = useState(false);

  const [matchedPerson, setMatchedPerson] = useState<null | {
    dateOfBirth: string;
    email: string;
    nationality: string;
    phone: string;
    address: string;
  }>(null);
  const [matchedCompany, setMatchedCompany] = useState<null | { countryOfIncorporation: string; companyAddress: string }>(null);

  const savedKey = companyId ? `gos.rorc.saved.${companyId}` : '';
  const [saved, setSaved] = useState<SavedDraft>({});
  const [useSavedPerson, setUseSavedPerson] = useState(false);
  const [useSavedCompany, setUseSavedCompany] = useState(false);

  useEffect(() => {
    if (!savedKey) return;
    const next = readSavedDraft(savedKey);
    setSaved(next);
    setUseSavedPerson(!!next.person);
    setUseSavedCompany(!!next.company);
    if (next.person?.effectiveDate) setEffectiveDate(String(next.person.effectiveDate).slice(0, 10));
  }, [savedKey]);

  useEffect(() => {
    if (mode === 'PERSON' && saved.person?.effectiveDate) setEffectiveDate(String(saved.person.effectiveDate).slice(0, 10));
    if (mode === 'COMPANY' && saved.company?.effectiveDate) setEffectiveDate(String(saved.company.effectiveDate).slice(0, 10));
  }, [mode, saved.company?.effectiveDate, saved.person?.effectiveDate]);

  const [person, setPerson] = useState({
    fullName: '',
    idType: 'PASSPORT' as IdType,
    idNo: '',
    dateOfBirth: '',
    email: '',
    nationality: '',
    phone: '',
    address: '',
    ccEnabled: false,
    ccName: '',
    ccTitle: '',
    ccPhone: '',
    ccEmailAddress: '',
  });

  const [company, setCompany] = useState({
    companyName: '',
    registerNumber: '',
    countryOfIncorporation: '',
    legalForm: '',
    governedByLawAndJurisdiction: '',
    registerOfCompanies: '',
    companyAddress: '',
    ccEnabled: false,
    ccName: '',
    ccTitle: '',
    ccPhone: '',
    ccEmailAddress: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idTypeLabel = useMemo(() => {
    if (mode !== 'PERSON') return '';
    if (person.idType === 'NRIC') return 'NRIC';
    if (person.idType === 'FIN') return 'FIN';
    if (person.idType === 'IC') return 'IC';
    return 'Passport';
  }, [mode, person.idType]);

  useEffect(() => {
    if (mode !== 'PERSON') return;
    if (useSavedPerson) return;
    if (personLockedFromLookup) return;
    const idNo = person.idNo.trim();
    if (!idNo) return;
    const label = ID_TYPE_LABEL_BY_VALUE[person.idType] ?? '';
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      const url = `/api/portal/people-lookup?idNo=${encodeURIComponent(idNo)}&idTypeLabel=${encodeURIComponent(label)}`;
      const res = await fetch(url, { cache: 'no-store', signal: ac.signal }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as
        | { ok: true; person: null }
        | {
            ok: true;
            person: { fullName: string; email?: string; phone?: string; nationality?: string; dob?: string; address?: string; idNo?: string };
          }
        | { ok: false; error?: string }
        | null;
      if (!res?.ok || !j || (j as any).ok !== true) return;
      const found = (j as any).person ?? null;
      if (!found) return;
      const match = {
        dateOfBirth: String(found.dob ?? '').trim(),
        email: String(found.email ?? '').trim(),
        nationality: String(found.nationality ?? '').trim(),
        phone: String(found.phone ?? '').trim(),
        address: String(found.address ?? '').trim(),
      };
      const canLock = !!(match.dateOfBirth && match.email && match.nationality && match.phone && match.address);
      if (canLock) {
        setMatchedPerson(match);
        setPerson((v) => ({
          ...v,
          fullName: String(found.fullName ?? ''),
          idNo: String(found.idNo ?? v.idNo ?? ''),
          dateOfBirth: '',
          email: '',
          nationality: '',
          phone: '',
          address: '',
        }));
        setPersonLockedFromLookup(true);
        return;
      }
      setMatchedPerson(null);
      setPerson((v) => ({
        ...v,
        fullName: String(found.fullName ?? ''),
        idNo: String(found.idNo ?? v.idNo ?? ''),
        dateOfBirth: match.dateOfBirth || v.dateOfBirth,
        email: match.email || v.email,
        nationality: match.nationality || v.nationality,
        phone: match.phone || v.phone,
        address: match.address || v.address,
      }));
      setPersonLockedFromLookup(false);
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [mode, person.idNo, person.idType, personLockedFromLookup, useSavedPerson]);

  useEffect(() => {
    if (mode !== 'COMPANY') return;
    if (useSavedCompany) return;
    if (companyLockedFromLookup) return;
    const regNo = company.registerNumber.trim();
    if (!regNo) return;
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      const url = `/api/portal/company-lookup?registrationNo=${encodeURIComponent(regNo)}`;
      const res = await fetch(url, { cache: 'no-store', signal: ac.signal }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as
        | { ok: true; company: null }
        | {
            ok: true;
            company: {
              name: string;
              companyRegistrationNo?: string;
              countryOfIncorporation?: string;
              address?: string;
              registeredOfficeAddress?: string;
            };
          }
        | { ok: false; error?: string }
        | null;
      if (!res?.ok || !j || (j as any).ok !== true) return;
      const found = (j as any).company ?? null;
      if (!found) return;
      const inferredCountry =
        String(found.countryOfIncorporation ?? '').trim() || (isSingaporeCompanyRegistrationNo(regNo) ? 'Singapore' : '');
      const inferredAddress = String(found.registeredOfficeAddress ?? found.address ?? '').trim();
      const canLock = !!(inferredCountry && inferredAddress);
      if (canLock) {
        setMatchedCompany({ countryOfIncorporation: inferredCountry, companyAddress: inferredAddress });
        setCompany((v) => ({
          ...v,
          companyName: String(found.name ?? ''),
          registerNumber: String(found.companyRegistrationNo ?? v.registerNumber ?? ''),
          countryOfIncorporation: '',
          companyAddress: '',
        }));
        setCompanyLockedFromLookup(true);
        return;
      }
      setMatchedCompany(null);
      setCompany((v) => ({
        ...v,
        companyName: String(found.name ?? ''),
        registerNumber: String(found.companyRegistrationNo ?? v.registerNumber ?? ''),
        countryOfIncorporation: inferredCountry || v.countryOfIncorporation,
        companyAddress: inferredAddress || v.companyAddress,
      }));
      setCompanyLockedFromLookup(false);
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [company.registerNumber, companyLockedFromLookup, mode, useSavedCompany]);

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }

    const eff = effectiveDate.trim();
    if (!eff) {
      setSubmitError(mode === 'PERSON' ? 'Please select Declared On.' : 'Please select Date On Which The Company Becomes Controller.');
      return;
    }

    if (mode === 'PERSON') {
      const savedP = saved.person;
      if (useSavedPerson && savedP) {
        setSubmitting(true);
        try {
          const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/rorc-declaration-requests`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              effectiveDate: eff,
              controllerType: 'PERSON',
              controllerPerson: {
                fullName: String(savedP.fullName ?? ''),
                idType: savedP.idType,
                idNo: String(savedP.idNo ?? ''),
                dateOfBirth: String(savedP.dateOfBirth ?? ''),
                email: String(savedP.email ?? ''),
                nationality: String(savedP.nationality ?? ''),
                phone: String(savedP.phone ?? ''),
                address: String(savedP.address ?? ''),
                ccEmailAddress: savedP.ccEnabled ? String(savedP.ccEmailAddress ?? '') || undefined : undefined,
                ccName: savedP.ccEnabled ? String(savedP.ccName ?? '') || undefined : undefined,
                ccTitle: savedP.ccEnabled ? String(savedP.ccTitle ?? '') || undefined : undefined,
                ccPhone: savedP.ccEnabled ? String(savedP.ccPhone ?? '') || undefined : undefined,
                useCcEmailInstead: false,
              },
            }),
          }).catch(() => null);
          const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
          if (!res?.ok || !j?.ok || !j.request?.id) {
            setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
            return;
          }
          setSaved((prev) => {
            const next: SavedDraft = { ...prev, person: { ...savedP, effectiveDate: eff } };
            if (savedKey) writeSavedDraft(savedKey, next);
            return next;
          });
          router.push(`/corporate-secretary/applications/rorc/${encodeURIComponent(j.request.id)}`);
        } finally {
          setSubmitting(false);
        }
        return;
      }

      const p = {
        ...person,
        fullName: person.fullName.trim(),
        idNo: person.idNo.trim(),
        dateOfBirth: (personLockedFromLookup && matchedPerson ? matchedPerson.dateOfBirth : person.dateOfBirth).trim(),
        email: (personLockedFromLookup && matchedPerson ? matchedPerson.email : person.email).trim(),
        nationality: (personLockedFromLookup && matchedPerson ? matchedPerson.nationality : person.nationality).trim(),
        phone: (personLockedFromLookup && matchedPerson ? matchedPerson.phone : person.phone).trim(),
        address: (personLockedFromLookup && matchedPerson ? matchedPerson.address : person.address).trim(),
        ccEnabled: !!person.ccEnabled,
        ccName: person.ccName.trim(),
        ccTitle: person.ccTitle.trim(),
        ccPhone: person.ccPhone.trim(),
        ccEmailAddress: person.ccEmailAddress.trim(),
      };

      if (!p.fullName) return void setSubmitError('RORC Controller Full Name is required.');
      if (!p.idNo) return void setSubmitError(`${idTypeLabel} number is required.`);
      if (!p.dateOfBirth) return void setSubmitError('Date Of Birth is required.');
      if (!p.nationality) return void setSubmitError('Nationality is required.');
      if (!p.phone) return void setSubmitError('Phone is required.');
      if (!p.address) return void setSubmitError('Address is required.');
      if (!p.email) return void setSubmitError('Email is required.');
      if (p.ccEnabled) {
        if (!p.ccName) return void setSubmitError('CC name is required.');
        if (!p.ccTitle) return void setSubmitError('CC position is required.');
        if (!p.ccPhone) return void setSubmitError('CC phone is required.');
        if (!p.ccEmailAddress) return void setSubmitError('CC email address is required.');
      }

      setSubmitting(true);
      try {
        const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/rorc-declaration-requests`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            effectiveDate: eff,
            controllerType: 'PERSON',
            controllerPerson: {
              fullName: p.fullName,
              idType: p.idType,
              idNo: p.idNo,
              dateOfBirth: p.dateOfBirth,
              email: p.email,
              nationality: p.nationality,
              phone: p.phone,
              address: p.address,
              ccName: p.ccEnabled ? p.ccName || undefined : undefined,
              ccTitle: p.ccEnabled ? p.ccTitle || undefined : undefined,
              ccPhone: p.ccEnabled ? p.ccPhone || undefined : undefined,
              ccEmailAddress: p.ccEnabled ? p.ccEmailAddress || undefined : undefined,
              useCcEmailInstead: false,
            },
          }),
        }).catch(() => null);
        const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
        if (!res?.ok || !j?.ok || !j.request?.id) {
          setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }

        setSaved((prev) => {
          const next: SavedDraft = {
            ...prev,
            person: {
              effectiveDate: eff,
              fullName: p.fullName,
              idType: p.idType,
              idNo: p.idNo,
              dateOfBirth: p.dateOfBirth,
              email: p.email,
              nationality: p.nationality,
              phone: p.phone,
              address: p.address,
              ccEnabled: p.ccEnabled,
              ccName: p.ccName,
              ccTitle: p.ccTitle,
              ccPhone: p.ccPhone,
              ccEmailAddress: p.ccEmailAddress,
            },
          };
          if (savedKey) writeSavedDraft(savedKey, next);
          return next;
        });
        router.push(`/corporate-secretary/applications/rorc/${encodeURIComponent(j.request.id)}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const savedC = saved.company;
    if (useSavedCompany && savedC) {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/rorc-declaration-requests`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            effectiveDate: eff,
            controllerType: 'COMPANY',
            controllerCompany: {
              companyName: String(savedC.companyName ?? ''),
              registerNumber: String(savedC.registerNumber ?? ''),
              countryOfIncorporation: String(savedC.countryOfIncorporation ?? ''),
              legalForm: String(savedC.legalForm ?? ''),
              governedByLawAndJurisdiction: String(savedC.governedByLawAndJurisdiction ?? ''),
              registerOfCompanies: String(savedC.registerOfCompanies ?? '') || undefined,
              companyAddress: String(savedC.companyAddress ?? ''),
              ccEmailAddress: savedC.ccEnabled ? String(savedC.ccEmailAddress ?? '') || undefined : undefined,
              ccName: savedC.ccEnabled ? String(savedC.ccName ?? '') || undefined : undefined,
              ccTitle: savedC.ccEnabled ? String(savedC.ccTitle ?? '') || undefined : undefined,
              ccPhone: savedC.ccEnabled ? String(savedC.ccPhone ?? '') || undefined : undefined,
              useCcEmailInstead: false,
            },
          }),
        }).catch(() => null);
        const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
        if (!res?.ok || !j?.ok || !j.request?.id) {
          setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }
        setSaved((prev) => {
          const next: SavedDraft = { ...prev, company: { ...savedC, effectiveDate: eff } };
          if (savedKey) writeSavedDraft(savedKey, next);
          return next;
        });
        router.push(`/corporate-secretary/applications/rorc/${encodeURIComponent(j.request.id)}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const c = {
      ...company,
      companyName: company.companyName.trim(),
      registerNumber: company.registerNumber.trim(),
      countryOfIncorporation: (companyLockedFromLookup && matchedCompany ? matchedCompany.countryOfIncorporation : company.countryOfIncorporation).trim(),
      legalForm: company.legalForm.trim(),
      governedByLawAndJurisdiction: company.governedByLawAndJurisdiction.trim(),
      registerOfCompanies: company.registerOfCompanies.trim(),
      companyAddress: (companyLockedFromLookup && matchedCompany ? matchedCompany.companyAddress : company.companyAddress).trim(),
      ccEnabled: !!company.ccEnabled,
      ccName: company.ccName.trim(),
      ccTitle: company.ccTitle.trim(),
      ccPhone: company.ccPhone.trim(),
      ccEmailAddress: company.ccEmailAddress.trim(),
    };

    if (!c.companyName) return void setSubmitError('RORC Controller Company is required.');
    if (!c.registerNumber) return void setSubmitError('RORC Controller Company Register Number is required.');
    if (!c.countryOfIncorporation) return void setSubmitError('Country of incorporation is required.');
    if (!c.legalForm) return void setSubmitError('Legal Form Of The Entity is required.');
    if (!c.governedByLawAndJurisdiction) return void setSubmitError('The Law By Which It Is Governed And In Which Jurisdiction is required.');
    if (!c.companyAddress) return void setSubmitError('RORC Controller Company Address is required.');
    if (c.ccEnabled) {
      if (!c.ccName) return void setSubmitError('CC name is required.');
      if (!c.ccTitle) return void setSubmitError('CC position is required.');
      if (!c.ccPhone) return void setSubmitError('CC phone is required.');
      if (!c.ccEmailAddress) return void setSubmitError('CC email address is required.');
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/rorc-declaration-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          effectiveDate: eff,
          controllerType: 'COMPANY',
          controllerCompany: {
            companyName: c.companyName,
            registerNumber: c.registerNumber,
            countryOfIncorporation: c.countryOfIncorporation,
            legalForm: c.legalForm,
            governedByLawAndJurisdiction: c.governedByLawAndJurisdiction,
            registerOfCompanies: c.registerOfCompanies || undefined,
            companyAddress: c.companyAddress,
            ccName: c.ccEnabled ? c.ccName || undefined : undefined,
            ccTitle: c.ccEnabled ? c.ccTitle || undefined : undefined,
            ccPhone: c.ccEnabled ? c.ccPhone || undefined : undefined,
            ccEmailAddress: c.ccEnabled ? c.ccEmailAddress || undefined : undefined,
            useCcEmailInstead: false,
          },
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }

      setSaved((prev) => {
        const next: SavedDraft = {
          ...prev,
          company: {
            effectiveDate: eff,
            companyName: c.companyName,
            registerNumber: c.registerNumber,
            countryOfIncorporation: c.countryOfIncorporation,
            legalForm: c.legalForm,
            governedByLawAndJurisdiction: c.governedByLawAndJurisdiction,
            registerOfCompanies: c.registerOfCompanies,
            companyAddress: c.companyAddress,
            ccEnabled: c.ccEnabled,
            ccName: c.ccName,
            ccTitle: c.ccTitle,
            ccPhone: c.ccPhone,
            ccEmailAddress: c.ccEmailAddress,
          },
        };
        if (savedKey) writeSavedDraft(savedKey, next);
        return next;
      });
      router.push(`/corporate-secretary/applications/rorc/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Declaration of Company Controller(RORC)" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div className="flex items-center justify-center">
            <label className="inline-flex items-center gap-2 text-sm">
              <span className={mode === 'PERSON' ? 'text-black font-medium' : 'text-black/50'}>Personal Controller</span>
              <input
                type="checkbox"
                checked={mode === 'COMPANY'}
                onChange={(e) => setMode(e.target.checked ? 'COMPANY' : 'PERSON')}
              />
              <span className={mode === 'COMPANY' ? 'text-black font-medium' : 'text-black/50'}>Company Controller</span>
            </label>
          </div>

          {mode === 'PERSON' ? (
            <>
              {saved.person ? (
                <label className="flex items-center gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={useSavedPerson}
                    onChange={(e) => setUseSavedPerson(e.target.checked)}
                  />
                  Use saved details (masked)
                </label>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Full Name
                  </div>
                  <input
                    value={
                      useSavedPerson && saved.person
                        ? maskKeepStartEnd(String(saved.person.fullName ?? ''), 1, 1)
                        : person.fullName
                    }
                    onChange={(e) => {
                      if (useSavedPerson || personLockedFromLookup) return;
                      setPerson((v) => ({ ...v, fullName: e.target.value }));
                    }}
                    disabled={useSavedPerson || personLockedFromLookup}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Passport/NRIC/FIN
                  </div>
                  <div className="mt-1 grid grid-cols-12 gap-2">
                    <select
                      value={(useSavedPerson && saved.person?.idType ? saved.person.idType : person.idType) as IdType}
                      onChange={(e) => {
                        if (useSavedPerson) return;
                        setPersonLockedFromLookup(false);
                        setMatchedPerson(null);
                        setPerson((v) => ({ ...v, idType: e.target.value as IdType }));
                      }}
                      disabled={useSavedPerson}
                      className="col-span-5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    >
                      <option value="PASSPORT">Passport</option>
                      <option value="NRIC">NRIC</option>
                      <option value="FIN">FIN</option>
                      <option value="IC">IC</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      value={
                        useSavedPerson && saved.person
                          ? maskKeepStartEnd(String(saved.person.idNo ?? ''), 2, 2)
                          : person.idNo
                      }
                      onChange={(e) => {
                        if (useSavedPerson) return;
                        setPersonLockedFromLookup(false);
                        setMatchedPerson(null);
                        setPerson((v) => ({ ...v, idNo: e.target.value }));
                      }}
                      disabled={useSavedPerson}
                      className="col-span-7 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </div>
                </label>
              </div>

              {!useSavedPerson && personLockedFromLookup && matchedPerson ? (
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Declared On
                  </div>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="text-sm">
                      <div className="text-black">
                        <span className="text-red-500">*</span> Date Of Birth
                      </div>
                      {useSavedPerson && saved.person ? (
                        <input
                          value={maskDateYmd(String(saved.person.dateOfBirth ?? ''))}
                          disabled
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                        />
                      ) : (
                        <input
                          type="date"
                          value={person.dateOfBirth}
                          onChange={(e) => {
                            if (personLockedFromLookup) return;
                            setPerson((v) => ({ ...v, dateOfBirth: e.target.value }));
                          }}
                          disabled={personLockedFromLookup}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      )}
                    </label>
                    <label className="text-sm">
                      <div className="text-black">
                        <span className="text-red-500">*</span> Email
                      </div>
                      <input
                        value={useSavedPerson && saved.person ? maskEmail(String(saved.person.email ?? '')) : person.email}
                        onChange={(e) => {
                          if (useSavedPerson || personLockedFromLookup) return;
                          setPerson((v) => ({ ...v, email: e.target.value }));
                        }}
                        disabled={useSavedPerson || personLockedFromLookup}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                      />
                    </label>
                  </div>

                  <label className="text-sm">
                    <div className="text-black">
                      <span className="text-red-500">*</span> Nationality
                    </div>
                    <input
                      value={
                        useSavedPerson && saved.person
                          ? maskKeepStartEnd(String(saved.person.nationality ?? ''), 1, 0)
                          : person.nationality
                      }
                      onChange={(e) => {
                        if (useSavedPerson || personLockedFromLookup) return;
                        setPerson((v) => ({ ...v, nationality: e.target.value }));
                      }}
                      disabled={useSavedPerson || personLockedFromLookup}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="text-sm">
                      <div className="text-black">
                        <span className="text-red-500">*</span> Phone
                      </div>
                      <input
                        value={useSavedPerson && saved.person ? maskPhone(String(saved.person.phone ?? '')) : person.phone}
                        onChange={(e) => {
                          if (useSavedPerson || personLockedFromLookup) return;
                          setPerson((v) => ({ ...v, phone: e.target.value }));
                        }}
                        disabled={useSavedPerson || personLockedFromLookup}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                      />
                    </label>
                    <label className="text-sm">
                      <div className="text-black">
                        <span className="text-red-500">*</span> Declared On
                      </div>
                      <input
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <label className="text-sm">
                    <div className="text-black">
                      <span className="text-red-500">*</span> Address
                    </div>
                    <textarea
                      value={
                        useSavedPerson && saved.person
                          ? maskKeepStartEnd(String(saved.person.address ?? ''), 6, 0)
                          : person.address
                      }
                      onChange={(e) => {
                        if (useSavedPerson || personLockedFromLookup) return;
                        setPerson((v) => ({ ...v, address: e.target.value }));
                      }}
                      rows={3}
                      disabled={useSavedPerson || personLockedFromLookup}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                </>
              )}

              <label className="flex items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={useSavedPerson && saved.person ? !!saved.person.ccEnabled : person.ccEnabled}
                  onChange={(e) => {
                    if (useSavedPerson) return;
                    const checked = e.target.checked;
                    setPerson((v) => ({
                      ...v,
                      ccEnabled: checked,
                      ...(checked
                        ? {}
                        : {
                            ccName: '',
                            ccTitle: '',
                            ccPhone: '',
                            ccEmailAddress: '',
                          }),
                    }));
                  }}
                  disabled={useSavedPerson}
                />
                CC management to declare
              </label>

              {(useSavedPerson && saved.person ? !!saved.person.ccEnabled : person.ccEnabled) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="text-sm">
                    <div className="text-black/70">CC Name</div>
                    <input
                      value={
                        useSavedPerson && saved.person
                          ? maskKeepStartEnd(String(saved.person.ccName ?? ''), 1, 1)
                          : person.ccName
                      }
                      onChange={(e) => {
                        if (useSavedPerson) return;
                        setPerson((v) => ({ ...v, ccName: e.target.value }));
                      }}
                      disabled={useSavedPerson}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">CC Position</div>
                    <input
                      value={
                        useSavedPerson && saved.person
                          ? maskKeepStartEnd(String(saved.person.ccTitle ?? ''), 2, 0)
                          : person.ccTitle
                      }
                      onChange={(e) => {
                        if (useSavedPerson) return;
                        setPerson((v) => ({ ...v, ccTitle: e.target.value }));
                      }}
                      disabled={useSavedPerson}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">CC Phone</div>
                    <input
                      value={useSavedPerson && saved.person ? maskPhone(String(saved.person.ccPhone ?? '')) : person.ccPhone}
                      onChange={(e) => {
                        if (useSavedPerson) return;
                        setPerson((v) => ({ ...v, ccPhone: e.target.value }));
                      }}
                      disabled={useSavedPerson}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">CC Email Address</div>
                    <input
                      value={useSavedPerson && saved.person ? maskEmail(String(saved.person.ccEmailAddress ?? '')) : person.ccEmailAddress}
                      onChange={(e) => {
                        if (useSavedPerson) return;
                        setPerson((v) => ({ ...v, ccEmailAddress: e.target.value }));
                      }}
                      disabled={useSavedPerson}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                </div>
              ) : null}

            </>
          ) : (
            <>
              {saved.company ? (
                <label className="flex items-center gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={useSavedCompany}
                    onChange={(e) => setUseSavedCompany(e.target.checked)}
                  />
                  Use saved details (masked)
                </label>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Company
                  </div>
                  <input
                    value={
                      useSavedCompany && saved.company
                        ? maskKeepStartEnd(String(saved.company.companyName ?? ''), 2, 2)
                        : company.companyName
                    }
                    onChange={(e) => {
                      if (useSavedCompany || companyLockedFromLookup) return;
                      setCompany((v) => ({ ...v, companyName: e.target.value }));
                    }}
                    disabled={useSavedCompany || companyLockedFromLookup}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Company Register Number
                  </div>
                  <input
                    value={
                      useSavedCompany && saved.company
                        ? maskKeepStartEnd(String(saved.company.registerNumber ?? ''), 2, 2)
                        : company.registerNumber
                    }
                    onChange={(e) => {
                      if (useSavedCompany) return;
                      setCompanyLockedFromLookup(false);
                      setMatchedCompany(null);
                      setCompany((v) => ({ ...v, registerNumber: e.target.value }));
                    }}
                    disabled={useSavedCompany}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Legal Form Of The Entity
                  </div>
                  <input
                    value={
                      useSavedCompany && saved.company
                        ? maskKeepStartEnd(String(saved.company.legalForm ?? ''), 6, 0)
                        : company.legalForm
                    }
                    onChange={(e) => {
                      if (useSavedCompany) return;
                      setCompany((v) => ({ ...v, legalForm: e.target.value }));
                    }}
                    placeholder="e.g. Private company limited by shares (Hong Kong)"
                    disabled={useSavedCompany}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> The Law By Which It Is Governed And In Which Jurisdiction
                  </div>
                  <input
                    value={
                      useSavedCompany && saved.company
                        ? maskKeepStartEnd(String(saved.company.governedByLawAndJurisdiction ?? ''), 6, 0)
                        : company.governedByLawAndJurisdiction
                    }
                    onChange={(e) => {
                      if (useSavedCompany) return;
                      setCompany((v) => ({ ...v, governedByLawAndJurisdiction: e.target.value }));
                    }}
                    placeholder="e.g. Companies Ordinance (Cap. 622), Hong Kong"
                    disabled={useSavedCompany}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
              </div>

              {!useSavedCompany && companyLockedFromLookup && matchedCompany ? (
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Date On Which The Company Becomes Controller
                  </div>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="text-sm">
                    <div className="text-black">
                      <span className="text-red-500">*</span> Country of incorporation
                    </div>
                    <CountryOfIncorporationSelect
                      value={useSavedCompany && saved.company ? String(saved.company.countryOfIncorporation ?? '') : company.countryOfIncorporation}
                      onChange={(v) => {
                        if (useSavedCompany || companyLockedFromLookup) return;
                        setCompany((x) => ({ ...x, countryOfIncorporation: v }));
                      }}
                      disabled={useSavedCompany || companyLockedFromLookup}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black">
                      <span className="text-red-500">*</span> Date On Which The Company Becomes Controller
                    </div>
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}

              <label className="text-sm">
                <div className="text-black/70">The Register Of Companies</div>
                <input
                  value={
                    useSavedCompany && saved.company
                      ? maskKeepStartEnd(String(saved.company.registerOfCompanies ?? ''), 6, 0)
                      : company.registerOfCompanies
                  }
                  onChange={(e) => {
                    if (useSavedCompany) return;
                    setCompany((v) => ({ ...v, registerOfCompanies: e.target.value }));
                  }}
                  placeholder="e.g. Companies Registry (Hong Kong)"
                  disabled={useSavedCompany}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                />
              </label>

              {!useSavedCompany && companyLockedFromLookup && matchedCompany ? null : (
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Company Address
                  </div>
                  <textarea
                    value={
                      useSavedCompany && saved.company
                        ? maskKeepStartEnd(String(saved.company.companyAddress ?? ''), 6, 0)
                        : company.companyAddress
                    }
                    onChange={(e) => {
                      if (useSavedCompany || companyLockedFromLookup) return;
                      setCompany((v) => ({ ...v, companyAddress: e.target.value }));
                    }}
                    rows={3}
                    disabled={useSavedCompany || companyLockedFromLookup}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
              )}

              <label className="flex items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={useSavedCompany && saved.company ? !!saved.company.ccEnabled : company.ccEnabled}
                  onChange={(e) => {
                    if (useSavedCompany) return;
                    const checked = e.target.checked;
                    setCompany((v) => ({
                      ...v,
                      ccEnabled: checked,
                      ...(checked
                        ? {}
                        : {
                            ccName: '',
                            ccTitle: '',
                            ccPhone: '',
                            ccEmailAddress: '',
                          }),
                    }));
                  }}
                  disabled={useSavedCompany}
                />
                CC management to declare
              </label>

              {(useSavedCompany && saved.company ? !!saved.company.ccEnabled : company.ccEnabled) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="text-sm">
                    <div className="text-black/70">CC Name</div>
                    <input
                      value={
                        useSavedCompany && saved.company
                          ? maskKeepStartEnd(String(saved.company.ccName ?? ''), 1, 1)
                          : company.ccName
                      }
                      onChange={(e) => {
                        if (useSavedCompany) return;
                        setCompany((v) => ({ ...v, ccName: e.target.value }));
                      }}
                      disabled={useSavedCompany}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">CC Position</div>
                    <input
                      value={
                        useSavedCompany && saved.company
                          ? maskKeepStartEnd(String(saved.company.ccTitle ?? ''), 2, 0)
                          : company.ccTitle
                      }
                      onChange={(e) => {
                        if (useSavedCompany) return;
                        setCompany((v) => ({ ...v, ccTitle: e.target.value }));
                      }}
                      disabled={useSavedCompany}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">CC Phone</div>
                    <input
                      value={useSavedCompany && saved.company ? maskPhone(String(saved.company.ccPhone ?? '')) : company.ccPhone}
                      onChange={(e) => {
                        if (useSavedCompany) return;
                        setCompany((v) => ({ ...v, ccPhone: e.target.value }));
                      }}
                      disabled={useSavedCompany}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">CC Email Address</div>
                    <input
                      value={useSavedCompany && saved.company ? maskEmail(String(saved.company.ccEmailAddress ?? '')) : company.ccEmailAddress}
                      onChange={(e) => {
                        if (useSavedCompany) return;
                        setCompany((v) => ({ ...v, ccEmailAddress: e.target.value }));
                      }}
                      disabled={useSavedCompany}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    />
                  </label>
                </div>
              ) : null}
            </>
          )}

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
