'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import { DateInputYMD } from '@/components/DateInputYMD';
import { formatDateDMY } from '@/lib/date';

type CorporateRepresentativeDraft = {
  shareholderCompanyClientId: string;
  representativeName: string;
  representativeIdType: 'PASSPORT' | 'NRIC' | 'FIN' | 'IC';
  representativeIdNo: string;
  representativeAddress: string;
  representativeEmail: string;
  representativePhone: string;
};

export default function ChangeCompanyNameClient() {
  const bbyRegisteredOfficeAddress = '8 Burn Road#15-03 Trivex Singapore 369977';
  const router = useRouter();
  const { companyId, proxyCompanyId, client, roles, loading, error, closeHref } = useCompanyContext();
  const prevManualMeetingVenueRef = useRef<string>('');

  const [newCompanyName, setNewCompanyName] = useState('');
  const [chairman, setChairman] = useState('');
  const [directorSendingNotice, setDirectorSendingNotice] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [meetingVenue, setMeetingVenue] = useState('');
  const [corporateRepresentatives, setCorporateRepresentatives] = useState<Record<string, CorporateRepresentativeDraft>>({});
  const [useByBridgeAddress, setUseByBridgeAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const directors = roles?.directors ?? [];
  const shareholders = roles?.shareholders ?? [];
  const shareholderPersonNames = shareholders
    .filter((s) => s.entity.type === 'PERSON')
    .map((s) => (s.entity.type === 'PERSON' ? s.entity.person.fullName : ''))
    .filter(Boolean);

  const shareholderCompanies = shareholders.filter((s) => s.entity.type === 'COMPANY') as Array<{
    role: { id: string };
    entity: { type: 'COMPANY'; company: { id: string; code: string; name: string } };
  }>;

  useEffect(() => {
    if (!shareholderCompanies.length) return;
    setCorporateRepresentatives((prev) => {
      const next = { ...prev };
      for (const s of shareholderCompanies) {
        const id = s.entity.company.id;
        if (next[id]) continue;
        next[id] = {
          shareholderCompanyClientId: id,
          representativeName: '',
          representativeIdType: 'PASSPORT',
          representativeIdNo: '',
          representativeAddress: '',
          representativeEmail: '',
          representativePhone: '',
        };
      }
      return next;
    });
  }, [shareholderCompanies.map((s) => s.entity.company.id).join('|')]);

  useEffect(() => {
    if (!shareholderCompanies.length) return;

    let cancelled = false;
    async function run() {
      for (const s of shareholderCompanies) {
        const shareholderCompanyId = s.entity.company.id;
        const res = await fetch(`/api/clients/${encodeURIComponent(shareholderCompanyId)}/corporate-representative`).catch(() => null);
        const j = (await res?.json().catch(() => null)) as
          | {
              ok: boolean;
              current?: { person?: { fullName?: string; email?: string; phone?: string; address?: string; idType?: string; idNo?: string } };
            }
          | null;
        if (cancelled) return;
        if (!res?.ok || !j?.ok) continue;

        const p = j.current?.person ?? null;
        if (!p) continue;

        const nextIdType = (() => {
          const v = String(p.idType ?? '').trim().toUpperCase();
          if (v === 'NRIC' || v === 'FIN' || v === 'PASSPORT' || v === 'IC') return v as CorporateRepresentativeDraft['representativeIdType'];
          return 'PASSPORT' as const;
        })();

        setCorporateRepresentatives((prev) => {
          const cur = prev[shareholderCompanyId];
          if (!cur) return prev;
          return {
            ...prev,
            [shareholderCompanyId]: {
              ...cur,
              representativeName: cur.representativeName.trim() ? cur.representativeName : String(p.fullName ?? ''),
              representativeEmail: cur.representativeEmail.trim() ? cur.representativeEmail : String(p.email ?? ''),
              representativePhone: cur.representativePhone.trim() ? cur.representativePhone : String(p.phone ?? ''),
              representativeAddress: cur.representativeAddress.trim() ? cur.representativeAddress : String(p.address ?? ''),
              representativeIdType: cur.representativeIdType || nextIdType,
              representativeIdNo: cur.representativeIdNo.trim() ? cur.representativeIdNo : String(p.idNo ?? ''),
            },
          };
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [shareholderCompanies.map((s) => s.entity.company.id).join('|')]);

  async function onSubmit() {
    setSubmitError(null);
    const nextName = newCompanyName.trim();
    const nextChairman = chairman.trim();
    const nextDirectorSendingNotice = directorSendingNotice.trim() || directors[0]?.entity.person.fullName?.trim() || '';
    const nextMeetingDate = meetingDate.trim();
    const nextNoticeDate = noticeDate.trim();
    const nextVenue = meetingVenue.trim();
    if (!companyId || !client) {
      setSubmitError('Company not loaded.');
      return;
    }
    if (!nextName) {
      setSubmitError('Proposed new name is required.');
      return;
    }
    if (!nextChairman) {
      setSubmitError('Chairman is required.');
      return;
    }
    if (!shareholderPersonNames.some((n) => n.trim() === nextChairman)) {
      setSubmitError('Chairman must be a shareholder.');
      return;
    }

    for (const s of shareholderCompanies) {
      const d = corporateRepresentatives[s.entity.company.id];
      if (!d) {
        setSubmitError('Corporate representative details are required.');
        return;
      }
      if (!d.representativeName.trim()) {
        setSubmitError(`Corporate representative name is required for ${s.entity.company.name}.`);
        return;
      }
        if (!String((d as any).representativeIdType ?? '').trim()) {
          setSubmitError(`Corporate representative ID type is required for ${s.entity.company.name}.`);
          return;
        }
      if (!d.representativeIdNo.trim()) {
        setSubmitError(`Corporate representative ID no. is required for ${s.entity.company.name}.`);
        return;
      }
      if (!d.representativeAddress.trim()) {
        setSubmitError(`Corporate representative address is required for ${s.entity.company.name}.`);
        return;
      }
      if (!d.representativeEmail.trim()) {
        setSubmitError(`Corporate representative email is required for ${s.entity.company.name}.`);
        return;
      }
    }
    if (!nextDirectorSendingNotice) {
      setSubmitError('Director sending notice is required.');
      return;
    }
    if (!nextMeetingDate) {
      setSubmitError('Meeting date is required.');
      return;
    }
    if (!nextNoticeDate) {
      setSubmitError('Notice date is required.');
      return;
    }
    if (!nextVenue) {
      setSubmitError('Meeting venue is required.');
      return;
    }

    const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!isYmd(nextMeetingDate)) {
      setSubmitError('Meeting date is invalid.');
      return;
    }
    if (!isYmd(nextNoticeDate)) {
      setSubmitError('Notice date is invalid.');
      return;
    }

    {
      const md = new Date(`${nextMeetingDate}T00:00:00.000Z`);
      const nd = new Date(`${nextNoticeDate}T00:00:00.000Z`);
      const latest = new Date(md);
      latest.setUTCDate(latest.getUTCDate() - 14);
      if (nd.getTime() > latest.getTime()) {
        setSubmitError(`Notice date must be on or before ${formatDateDMY(latest.toISOString().slice(0, 10))}.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/company-update-requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(proxyCompanyId ? { 'x-gos-proxy-company-id': proxyCompanyId } : {}),
        },
        body: JSON.stringify({
          type: 'CHANGE_COMPANY_NAME',
          payload: {
            originalCompanyName: client.name,
            newCompanyName: nextName,
            chairman: nextChairman,
            directorSendingNotice: nextDirectorSendingNotice,
            meetingDate: nextMeetingDate,
            noticeDateYmd: nextNoticeDate,
            meetingVenue: nextVenue,
            useByBridgeRegisteredOfficeAddress: useByBridgeAddress,
            corporateRepresentatives: shareholderCompanies.map((s) => {
              const d = corporateRepresentatives[s.entity.company.id];
              return {
                shareholderCompanyClientId: s.entity.company.id,
                representativeName: String(d?.representativeName ?? '').trim(),
                representativeIdType: String((d as any)?.representativeIdType ?? '').trim(),
                representativeIdNo: String(d?.representativeIdNo ?? '').trim(),
                representativeAddress: String(d?.representativeAddress ?? '').trim(),
                representativeEmail: String(d?.representativeEmail ?? '').trim(),
                representativePhone: String(d?.representativePhone ?? '').trim(),
              };
            }),
          },
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        if (j?.error === 'INVALID_INPUT') setSubmitError('Invalid input. Please check meeting date, notice date and required fields.');
        else setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      router.push(`/corporate-secretary/applications/company-update/${encodeURIComponent(j.request.id)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Change of Company Name" closeHref={closeHref}>
      {submitError ? <div className="mb-3 text-sm text-red-600">{submitError}</div> : null}

      {loading ? <div className="text-sm text-black/60">Loading...</div> : null}
      {!loading && (error || !client) ? <div className="text-sm text-red-600">{error ?? 'NOT_FOUND'}</div> : null}

      {!loading && client ? (
        <div className="space-y-5">
          <div className="text-sm">
            <span className="text-black/60">Original Company :</span> <span className="text-black">{client.name}</span>
          </div>

          {shareholderCompanies.length ? (
            <div className="space-y-3">
              {shareholderCompanies.map((s) => {
                const company = s.entity.company;
                const d = corporateRepresentatives[company.id] ?? {
                  shareholderCompanyClientId: company.id,
                  representativeName: '',
                  representativeIdType: 'PASSPORT',
                  representativeIdNo: '',
                  representativeAddress: '',
                  representativeEmail: '',
                  representativePhone: '',
                };
                return (
                  <div key={company.id} className="rounded-lg border border-black/10 p-4">
                    <div className="text-sm font-medium text-black">Corporate representative</div>
                    <div className="text-sm text-black/80 mt-1">Shareholder company: {company.name}</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Name
                        </div>
                        <input
                          value={d.representativeName}
                          onChange={(e) =>
                            setCorporateRepresentatives((prev) => ({
                              ...prev,
                              [company.id]: { ...d, representativeName: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> ID no.
                        </div>
                        <div className="mt-1 grid grid-cols-12 gap-2">
                          <select
                            value={d.representativeIdType}
                            onChange={(e) =>
                              setCorporateRepresentatives((prev) => ({
                                ...prev,
                                [company.id]: { ...d, representativeIdType: e.target.value as CorporateRepresentativeDraft['representativeIdType'] },
                              }))
                            }
                            className="col-span-5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                          >
                            <option value="PASSPORT">Passport</option>
                            <option value="NRIC">NRIC</option>
                            <option value="FIN">FIN</option>
                            <option value="IC">IC</option>
                          </select>
                          <input
                            value={d.representativeIdNo}
                            onChange={(e) =>
                              setCorporateRepresentatives((prev) => ({
                                ...prev,
                                [company.id]: { ...d, representativeIdNo: e.target.value },
                              }))
                            }
                            className="col-span-7 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        </div>
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Email
                        </div>
                        <input
                          value={d.representativeEmail}
                          onChange={(e) =>
                            setCorporateRepresentatives((prev) => ({
                              ...prev,
                              [company.id]: { ...d, representativeEmail: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="sm:col-span-6 text-sm">
                        <div className="text-black">Phone</div>
                        <input
                          value={d.representativePhone}
                          onChange={(e) =>
                            setCorporateRepresentatives((prev) => ({
                              ...prev,
                              [company.id]: { ...d, representativePhone: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="sm:col-span-12 text-sm">
                        <div className="text-black">
                          <span className="text-red-500">*</span> Address
                        </div>
                        <textarea
                          value={d.representativeAddress}
                          onChange={(e) =>
                            setCorporateRepresentatives((prev) => ({
                              ...prev,
                              [company.id]: { ...d, representativeAddress: e.target.value },
                            }))
                          }
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <label className="sm:col-span-12 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Proposed new name :
              </div>
              <input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="sm:col-span-4 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Chairman :
              </div>
              <select
                value={chairman}
                onChange={(e) => setChairman(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {(shareholders.filter((s) => (s as any)?.entity?.type === 'PERSON') as Array<any>).map((s) => (
                  <option key={s.role.id} value={s.entity.person.fullName}>
                    {s.entity.person.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-8 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Meeting date :
              </div>
              <DateInputYMD
                value={meetingDate}
                onChange={setMeetingDate}
                inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>

            <label className="sm:col-span-6 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Director sending notice :
              </div>
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
            </label>

            <label className="sm:col-span-6 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Notice date :
              </div>
              <DateInputYMD
                value={noticeDate}
                onChange={setNoticeDate}
                inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                max={
                  meetingDate && /^\d{4}-\d{2}-\d{2}$/.test(meetingDate)
                    ? (() => {
                        const md = new Date(`${meetingDate}T00:00:00.000Z`);
                        const latest = new Date(md);
                        latest.setUTCDate(latest.getUTCDate() - 14);
                        return latest.toISOString().slice(0, 10);
                      })()
                    : undefined
                }
              />
            </label>

            <label className="sm:col-span-12 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Meeting Venue :
              </div>
              <input
                value={meetingVenue}
                onChange={(e) => setMeetingVenue(e.target.value)}
                disabled={useByBridgeAddress}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeAddress}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  if (meetingVenue.trim() && meetingVenue.trim() !== bbyRegisteredOfficeAddress) prevManualMeetingVenueRef.current = meetingVenue;
                  setUseByBridgeAddress(true);
                  setMeetingVenue(bbyRegisteredOfficeAddress);
                } else {
                  setUseByBridgeAddress(false);
                  if (meetingVenue.trim() === bbyRegisteredOfficeAddress) setMeetingVenue(prevManualMeetingVenueRef.current || '');
                }
              }}
              className="h-4 w-4"
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
