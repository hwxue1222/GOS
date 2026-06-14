'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

type IdType = 'PASSPORT' | 'NRIC' | 'FIN' | 'IC';

export default function RorcClient() {
  const router = useRouter();
  const { companyId, client, loading, error, closeHref } = useCompanyContext();

  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [mode, setMode] = useState<'PERSON' | 'COMPANY'>('PERSON');
  const [effectiveDate, setEffectiveDate] = useState(todayYmd);

  const [person, setPerson] = useState({
    fullName: '',
    idType: 'PASSPORT' as IdType,
    idNo: '',
    dateOfBirth: '',
    email: '',
    nationality: '',
    phone: '',
    address: '',
    ccName: '',
    ccTitle: '',
    ccPhone: '',
    ccEmailAddress: '',
    useCcEmailInstead: false,
  });

  const [company, setCompany] = useState({
    companyName: '',
    registerNumber: '',
    legalForm: '',
    governedByLawAndJurisdiction: '',
    registerOfCompanies: '',
    companyAddress: '',
    ccName: '',
    ccTitle: '',
    ccPhone: '',
    ccEmailAddress: '',
    useCcEmailInstead: false,
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
      const p = {
        ...person,
        fullName: person.fullName.trim(),
        idNo: person.idNo.trim(),
        dateOfBirth: person.dateOfBirth.trim(),
        email: person.email.trim(),
        nationality: person.nationality.trim(),
        phone: person.phone.trim(),
        address: person.address.trim(),
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
      if (p.useCcEmailInstead) {
        if (!p.ccEmailAddress) return void setSubmitError('Cc Email Address is required.');
      } else {
        if (!p.email) return void setSubmitError('Email is required.');
      }
      if (p.ccEmailAddress) {
        if (!p.ccName) return void setSubmitError('CC name is required.');
        if (!p.ccTitle) return void setSubmitError('CC position is required.');
        if (!p.ccPhone) return void setSubmitError('CC phone is required.');
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
              ccName: p.ccName || undefined,
              ccTitle: p.ccTitle || undefined,
              ccPhone: p.ccPhone || undefined,
              ccEmailAddress: p.ccEmailAddress || undefined,
              useCcEmailInstead: p.useCcEmailInstead,
            },
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
      return;
    }

    const c = {
      ...company,
      companyName: company.companyName.trim(),
      registerNumber: company.registerNumber.trim(),
      legalForm: company.legalForm.trim(),
      governedByLawAndJurisdiction: company.governedByLawAndJurisdiction.trim(),
      registerOfCompanies: company.registerOfCompanies.trim(),
      companyAddress: company.companyAddress.trim(),
      ccName: company.ccName.trim(),
      ccTitle: company.ccTitle.trim(),
      ccPhone: company.ccPhone.trim(),
      ccEmailAddress: company.ccEmailAddress.trim(),
    };

    if (!c.companyName) return void setSubmitError('RORC Controller Company is required.');
    if (!c.registerNumber) return void setSubmitError('RORC Controller Company Register Number is required.');
    if (!c.legalForm) return void setSubmitError('Legal Form Of The Entity is required.');
    if (!c.governedByLawAndJurisdiction) return void setSubmitError('The Law By Which It Is Governed And In Which Jurisdiction is required.');
    if (!c.companyAddress) return void setSubmitError('RORC Controller Company Address is required.');
    if (c.useCcEmailInstead && !c.ccEmailAddress) return void setSubmitError('Cc Email Address is required.');
    if (c.ccEmailAddress) {
      if (!c.ccName) return void setSubmitError('CC name is required.');
      if (!c.ccTitle) return void setSubmitError('CC position is required.');
      if (!c.ccPhone) return void setSubmitError('CC phone is required.');
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
            legalForm: c.legalForm,
            governedByLawAndJurisdiction: c.governedByLawAndJurisdiction,
            registerOfCompanies: c.registerOfCompanies || undefined,
            companyAddress: c.companyAddress,
            ccName: c.ccName || undefined,
            ccTitle: c.ccTitle || undefined,
            ccPhone: c.ccPhone || undefined,
            ccEmailAddress: c.ccEmailAddress || undefined,
            useCcEmailInstead: c.useCcEmailInstead,
          },
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Full Name
                  </div>
                  <input
                    value={person.fullName}
                    onChange={(e) => setPerson((v) => ({ ...v, fullName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Passport/NRIC/FIN
                  </div>
                  <div className="mt-1 grid grid-cols-12 gap-2">
                    <select
                      value={person.idType}
                      onChange={(e) => setPerson((v) => ({ ...v, idType: e.target.value as IdType }))}
                      className="col-span-5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      <option value="PASSPORT">Passport</option>
                      <option value="NRIC">NRIC</option>
                      <option value="FIN">FIN</option>
                      <option value="IC">IC</option>
                    </select>
                    <input
                      value={person.idNo}
                      onChange={(e) => setPerson((v) => ({ ...v, idNo: e.target.value }))}
                      className="col-span-7 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Date Of Birth
                  </div>
                  <input
                    type="date"
                    value={person.dateOfBirth}
                    onChange={(e) => setPerson((v) => ({ ...v, dateOfBirth: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Email
                  </div>
                  <input
                    value={person.email}
                    onChange={(e) => setPerson((v) => ({ ...v, email: e.target.value }))}
                    disabled={person.useCcEmailInstead}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
              </div>

              <label className="text-sm">
                <div className="text-black">
                  <span className="text-red-500">*</span> Nationality
                </div>
                <input
                  value={person.nationality}
                  onChange={(e) => setPerson((v) => ({ ...v, nationality: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Phone
                  </div>
                  <input
                    value={person.phone}
                    onChange={(e) => setPerson((v) => ({ ...v, phone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
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
                  value={person.address}
                  onChange={(e) => setPerson((v) => ({ ...v, address: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black/70">CC Name</div>
                  <input
                    value={person.ccName}
                    onChange={(e) => setPerson((v) => ({ ...v, ccName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">CC Position</div>
                  <input
                    value={person.ccTitle}
                    onChange={(e) => setPerson((v) => ({ ...v, ccTitle: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">CC Phone</div>
                  <input
                    value={person.ccPhone}
                    onChange={(e) => setPerson((v) => ({ ...v, ccPhone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">CC Email Address</div>
                  <input
                    value={person.ccEmailAddress}
                    onChange={(e) => setPerson((v) => ({ ...v, ccEmailAddress: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={person.useCcEmailInstead}
                  onChange={(e) => setPerson((v) => ({ ...v, useCcEmailInstead: e.target.checked }))}
                />
                To use cc email address instead of origin email address
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Company
                  </div>
                  <input
                    value={company.companyName}
                    onChange={(e) => setCompany((v) => ({ ...v, companyName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> RORC Controller Company Register Number
                  </div>
                  <input
                    value={company.registerNumber}
                    onChange={(e) => setCompany((v) => ({ ...v, registerNumber: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> Legal Form Of The Entity
                  </div>
                  <input
                    value={company.legalForm}
                    onChange={(e) => setCompany((v) => ({ ...v, legalForm: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black">
                    <span className="text-red-500">*</span> The Law By Which It Is Governed And In Which Jurisdiction
                  </div>
                  <input
                    value={company.governedByLawAndJurisdiction}
                    onChange={(e) => setCompany((v) => ({ ...v, governedByLawAndJurisdiction: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black/70">The Register Of Companies</div>
                  <input
                    value={company.registerOfCompanies}
                    onChange={(e) => setCompany((v) => ({ ...v, registerOfCompanies: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
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

              <label className="text-sm">
                <div className="text-black">
                  <span className="text-red-500">*</span> RORC Controller Company Address
                </div>
                <textarea
                  value={company.companyAddress}
                  onChange={(e) => setCompany((v) => ({ ...v, companyAddress: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <div className="text-black/70">CC Name</div>
                  <input
                    value={company.ccName}
                    onChange={(e) => setCompany((v) => ({ ...v, ccName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">CC Position</div>
                  <input
                    value={company.ccTitle}
                    onChange={(e) => setCompany((v) => ({ ...v, ccTitle: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">CC Phone</div>
                  <input
                    value={company.ccPhone}
                    onChange={(e) => setCompany((v) => ({ ...v, ccPhone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">CC Email Address</div>
                  <input
                    value={company.ccEmailAddress}
                    onChange={(e) => setCompany((v) => ({ ...v, ccEmailAddress: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={company.useCcEmailInstead}
                  onChange={(e) => setCompany((v) => ({ ...v, useCcEmailInstead: e.target.checked }))}
                />
                To use cc email address instead of origin email address
              </label>
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
