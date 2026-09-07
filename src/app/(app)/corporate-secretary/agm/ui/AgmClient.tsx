'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import { DateInputYMD } from '@/components/DateInputYMD';

export default function AgmClient() {
  const bbyRegisteredOfficeAddress = '8 Burn Road#15-03 Trivex Singapore 369977';
  const router = useRouter();
  const { companyId, proxyCompanyId, client, roles, loading, error, closeHref } = useCompanyContext();
  const isProxyingThisCompany = !!proxyCompanyId && !!companyId && proxyCompanyId === companyId;

  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const shareholders = roles?.shareholders ?? [];
  const shareholderPersons = shareholders.filter((s) => (s as any)?.entity?.type === 'PERSON') as Array<
    (typeof shareholders)[number] & { entity: { type: 'PERSON'; person: { fullName: string } } }
  >;
  const shareholderCompanies = shareholders.filter((s) => (s as any)?.entity?.type === 'COMPANY') as Array<
    (typeof shareholders)[number] & { entity: { type: 'COMPANY'; company: { id: string; name: string } } }
  >;
  const directors = roles?.directors ?? [];
  const directorsByName = useMemo(() => {
    const m = new Map<string, { fullName: string; email?: string }>();
    for (const d of directors) {
      const fullName = String(d.entity.person.fullName ?? '').trim();
      if (!fullName) continue;
      m.set(fullName, { fullName, email: d.entity.person.email });
    }
    return m;
  }, [directors]);
  const hasDirectors = directors.length > 0;
  const needsManualDirectorSigner = !hasDirectors;

  const [chairmanSelection, setChairmanSelection] = useState('');
  const selectedChairman = useMemo(() => {
    const raw = String(chairmanSelection ?? '').trim();
    const m = raw.match(/^(PERSON|COMPANY)\:(.*)$/);
    if (!m) return { kind: '' as const };
    const kind = m[1] as 'PERSON' | 'COMPANY';
    const idOrName = String(m[2] ?? '').trim();
    if (!idOrName) return { kind: '' as const };
    if (kind === 'PERSON') return { kind, personName: idOrName };
    const company = shareholderCompanies.find((c) => String(c.entity.company.id) === idOrName) ?? null;
    return { kind, companyId: idOrName, companyName: company?.entity.company.name ?? '' };
  }, [chairmanSelection, shareholderCompanies]);
  const needsCorporateRepresentative = selectedChairman.kind === 'COMPANY';

  const [meetingDate, setMeetingDate] = useState(todayYmd);
  const [meetingTime, setMeetingTime] = useState('10:00');
  const [fiscalYearReport, setFiscalYearReport] = useState('');
  const [meetingVenue, setMeetingVenue] = useState('');
  const prevManualVenueRef = useRef<string>('');
  const [directorSendingNotice, setDirectorSendingNotice] = useState('');
  const [corporateRepresentativeName, setCorporateRepresentativeName] = useState('');
  const [corporateRepresentativeEmail, setCorporateRepresentativeEmail] = useState('');
  const [directorSignerName, setDirectorSignerName] = useState('');
  const [directorSignerEmail, setDirectorSignerEmail] = useState('');
  const [companyCategory, setCompanyCategory] = useState<'SME' | 'DORMANT' | 'AUDITED' | ''>('');
  const [useByBridgeAddress, setUseByBridgeAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const years: string[] = [];
    for (let i = 0; i < 12; i++) years.push(String(y - i));
    return years;
  }, []);

  const fyeLabel = useMemo(() => {
    const y = String(fiscalYearReport ?? '').trim();
    if (!y) return '';
    const raw = String(client?.fye ?? '').trim();
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) return `FY ${y}`;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || dd < 1 || dd > 31 || mm < 1 || mm > 12) return `FY ${y}`;
    return `FYE ${dd}/${mm}/${y}`;
  }, [client?.fye, fiscalYearReport]);

  useEffect(() => {
    if (!useByBridgeAddress) return;
    if (meetingVenue.trim() && meetingVenue.trim() !== bbyRegisteredOfficeAddress) prevManualVenueRef.current = meetingVenue;
    setMeetingVenue(bbyRegisteredOfficeAddress);
  }, [bbyRegisteredOfficeAddress, meetingVenue, useByBridgeAddress]);

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }
    const md = meetingDate.trim();
    const mt = meetingTime.trim();
    const mv = meetingVenue.trim();
    const corpRepName = corporateRepresentativeName.trim();
    const corpRepEmail = corporateRepresentativeEmail.trim();
    const resolvedChairman = (needsCorporateRepresentative ? corpRepName : (selectedChairman as any).personName || '').trim();
    const signerName = directorSignerName.trim();
    const signerEmail = directorSignerEmail.trim();
    const nd = (hasDirectors ? directorSendingNotice : signerName).trim();
    const fy = fiscalYearReport.trim();
    if (!md || !mt || !mv || !resolvedChairman || !nd || !companyCategory || !fy) {
      setSubmitError('Please fill in required fields.');
      return;
    }
    if (needsCorporateRepresentative && (!corpRepName || !corpRepEmail)) {
      setSubmitError('Please fill in corporate representative name and email.');
      return;
    }
    if (needsManualDirectorSigner && (!signerName || !signerEmail)) {
      setSubmitError('Please fill in director signer name and email.');
      return;
    }

    const meetingM = md.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const fyeM = String(client.fye ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (meetingM && /^\d{4}$/.test(fy) && fyeM) {
      const meetingDateUtc = new Date(Date.UTC(Number(meetingM[1]), Number(meetingM[2]) - 1, Number(meetingM[3])));
      const dd = Number(fyeM[1]);
      const mm = Number(fyeM[2]);
      if (Number.isFinite(dd) && Number.isFinite(mm) && dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
        const fyeUtc = new Date(Date.UTC(Number(fy), mm - 1, dd));
        if (Number.isFinite(meetingDateUtc.getTime()) && Number.isFinite(fyeUtc.getTime()) && fyeUtc.getTime() > meetingDateUtc.getTime()) {
          setSubmitError('FYE date cannot be after the AGM meeting date. Please choose an earlier fiscal year.');
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/annual-general-meeting-requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(isProxyingThisCompany ? { 'x-gos-proxy-company-id': proxyCompanyId } : {}),
        },
        body: JSON.stringify({
          meetingDate: md,
          meetingTime: mt,
          meetingVenue: mv,
          chairman: resolvedChairman,
          directorSendingNotice: nd,
          corporateRepresentativeName: needsCorporateRepresentative ? corpRepName : undefined,
          corporateRepresentativeEmail: needsCorporateRepresentative ? corpRepEmail : undefined,
          directorSignerName: needsManualDirectorSigner ? signerName : undefined,
          directorSignerEmail: needsManualDirectorSigner ? signerEmail : undefined,
          companyCategory: companyCategory || undefined,
          fiscalYearReport: fy,
          useByBridgeRegisteredOfficeAddress: useByBridgeAddress,
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        if (j?.error === 'FYE_IN_FUTURE') {
          setSubmitError('FYE date cannot be after the AGM meeting date. Please choose an earlier fiscal year.');
        } else {
          setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        }
        return;
      }
      router.push(`/corporate-secretary/applications/agm/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Annual General Meeting" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Chairman
              </div>
              <select
                value={chairmanSelection}
                onChange={(e) => {
                  const v = e.target.value;
                  setChairmanSelection(v);
                  setCorporateRepresentativeName('');
                  setCorporateRepresentativeEmail('');
                }}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {shareholderPersons.length ? (
                  <optgroup label="Individual shareholder">
                    {shareholderPersons.map((s) => (
                      <option key={s.role.id} value={`PERSON:${s.entity.person.fullName}`}>
                        {s.entity.person.fullName}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {shareholderCompanies.length ? (
                  <optgroup label="Corporate shareholder">
                    {shareholderCompanies.map((s) => (
                      <option key={s.role.id} value={`COMPANY:${s.entity.company.id}`}>
                        {s.entity.company.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Director sending notice
              </div>
              {hasDirectors ? (
                <select
                  value={directorSendingNotice}
                  onChange={(e) => setDirectorSendingNotice(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  {directors.map((d) => (
                    <option key={d.role.id} value={d.entity.person.fullName}>
                      {d.entity.person.fullName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 w-full rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/60">Use director signer below</div>
              )}
            </label>
          </div>

          {needsCorporateRepresentative ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm">
                <div className="text-black">
                  <span className="text-red-500">*</span> Corporate representative
                </div>
                {hasDirectors ? (
                  <select
                    value={corporateRepresentativeName}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setCorporateRepresentativeName(nextName);
                      const email = (directorsByName.get(nextName)?.email ?? '').trim();
                      if (email) setCorporateRepresentativeEmail(email);
                    }}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select</option>
                    {directors.map((d) => (
                      <option key={d.role.id} value={d.entity.person.fullName}>
                        {d.entity.person.fullName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={corporateRepresentativeName}
                    onChange={(e) => setCorporateRepresentativeName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Corporate representative name"
                  />
                )}
                {selectedChairman.kind === 'COMPANY' && selectedChairman.companyName ? (
                  <div className="mt-1 text-xs text-black/50">Shareholder: {selectedChairman.companyName}</div>
                ) : null}
              </label>
              <label className="text-sm">
                <div className="text-black">
                  <span className="text-red-500">*</span> Corporate representative email
                </div>
                <input
                  type="email"
                  value={corporateRepresentativeEmail}
                  onChange={(e) => setCorporateRepresentativeEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="name@email.com"
                />
              </label>
            </div>
          ) : null}

          {needsManualDirectorSigner ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm">
                <div className="text-black">
                  <span className="text-red-500">*</span> Director signer name
                </div>
                {hasDirectors ? (
                  <select
                    value={directorSignerName}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setDirectorSignerName(nextName);
                      const email = (directorsByName.get(nextName)?.email ?? '').trim();
                      if (email) setDirectorSignerEmail(email);
                    }}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select</option>
                    {directors.map((d) => (
                      <option key={d.role.id} value={d.entity.person.fullName}>
                        {d.entity.person.fullName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={directorSignerName}
                    onChange={(e) => setDirectorSignerName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Director signer name"
                  />
                )}
              </label>

              <label className="text-sm">
                <div className="text-black">
                  <span className="text-red-500">*</span> Director signer email
                </div>
                <input
                  type="email"
                  value={directorSignerEmail}
                  onChange={(e) => setDirectorSignerEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="name@email.com"
                />
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm text-black/80">
              <input
                type="radio"
                name="companyCategory"
                checked={companyCategory === 'SME'}
                onChange={() => setCompanyCategory('SME')}
              />
              Small and medium-sized enterprises(SME)
            </label>
            <label className="flex items-center gap-2 text-sm text-black/80">
              <input
                type="radio"
                name="companyCategory"
                checked={companyCategory === 'DORMANT'}
                onChange={() => setCompanyCategory('DORMANT')}
              />
              Dormant company
            </label>
            <label className="flex items-center gap-2 text-sm text-black/80">
              <input
                type="radio"
                name="companyCategory"
                checked={companyCategory === 'AUDITED'}
                onChange={() => setCompanyCategory('AUDITED')}
              />
              Audited company
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Date Of Meeting
              </div>
              <DateInputYMD
                value={meetingDate}
                onChange={setMeetingDate}
                inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Time Of Meeting
              </div>
              <input
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Fiscal Financial Year Report
              </div>
              <select
                value={fiscalYearReport}
                onChange={(e) => setFiscalYearReport(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select year</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              {fyeLabel ? (
                <div className="mb-1 inline-flex items-center rounded-full bg-black/5 border border-black/10 px-3 py-1 text-xs font-medium text-black/70">
                  {fyeLabel}
                </div>
              ) : null}
            </div>
          </div>

          <label className="text-sm">
            <div className="text-black">
              <span className="text-red-500">*</span> Meeting Venue
            </div>
            <textarea
              value={meetingVenue}
              onChange={(e) => setMeetingVenue(e.target.value)}
              disabled={useByBridgeAddress}
              rows={3}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeAddress}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  if (meetingVenue.trim() && meetingVenue.trim() !== bbyRegisteredOfficeAddress) prevManualVenueRef.current = meetingVenue;
                  setUseByBridgeAddress(true);
                  setMeetingVenue(bbyRegisteredOfficeAddress);
                } else {
                  setUseByBridgeAddress(false);
                  if (meetingVenue.trim() === bbyRegisteredOfficeAddress) setMeetingVenue(prevManualVenueRef.current || '');
                }
              }}
            />
            To use BBY registered office address
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
