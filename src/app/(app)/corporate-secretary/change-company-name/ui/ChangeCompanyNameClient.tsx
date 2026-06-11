'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import { getInvoiceIssuerConfig } from '@/lib/invoice';
import { formatDateDMY } from '@/lib/date';

export default function ChangeCompanyNameClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();
  const bybridgeAddress = useMemo(() => getInvoiceIssuerConfig('BYBRIDGE').addressLine ?? '', []);

  const [newCompanyName, setNewCompanyName] = useState('');
  const [chairman, setChairman] = useState('');
  const [directorSendingNotice, setDirectorSendingNotice] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [meetingVenue, setMeetingVenue] = useState('');
  const [useByBridgeAddress, setUseByBridgeAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const directors = roles?.directors ?? [];

  async function onSubmit() {
    setSubmitError(null);
    const nextName = newCompanyName.trim();
    const nextChairman = chairman.trim();
    const nextDirectorSendingNotice = directorSendingNotice.trim();
    const nextMeetingDate = meetingDate.trim();
    const nextNoticeDate = noticeDate.trim();
    const nextVenue = meetingVenue.trim();
    if (!companyId || !client) {
      setSubmitError('Company not loaded.');
      return;
    }
    if (!nextName) {
      setSubmitError('New Company is required.');
      return;
    }
    if (!nextChairman) {
      setSubmitError('Chairman is required.');
      return;
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
        headers: { 'content-type': 'application/json' },
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

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <label className="sm:col-span-12 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> New Company :
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
                {directors.map((d) => (
                  <option key={d.role.id} value={d.entity.person.fullName}>
                    {d.entity.person.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-8 text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Meeting date :
              </div>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
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
              <input
                type="date"
                value={noticeDate}
                onChange={(e) => setNoticeDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
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
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeAddress}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseByBridgeAddress(checked);
                if (checked) setMeetingVenue(bybridgeAddress);
              }}
              className="h-4 w-4"
            />
            To use ByBridge registered office address
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
