'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';
import { getInvoiceIssuerConfig } from '@/lib/invoice';

export default function AgmClient() {
  const router = useRouter();
  const { companyId, client, roles, loading, error, closeHref } = useCompanyContext();

  const shareholders = roles?.shareholders ?? [];
  const shareholderPersons = shareholders.filter(
    (s): s is { role: { id: string }; entity: { type: 'PERSON'; person: { fullName: string } } } => s.entity.type === 'PERSON',
  );
  const directors = roles?.directors ?? [];

  const [meetingDate, setMeetingDate] = useState('');
  const [fiscalYearReport, setFiscalYearReport] = useState('');
  const [meetingVenue, setMeetingVenue] = useState('');
  const [chairman, setChairman] = useState('');
  const [noticeDirector, setNoticeDirector] = useState('');
  const [companyCategory, setCompanyCategory] = useState<'SME' | 'DORMANT' | ''>('');
  const [useByBridgeAddress, setUseByBridgeAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const years: string[] = [];
    for (let i = 0; i < 12; i++) years.push(String(y - i));
    return years;
  }, []);

  useEffect(() => {
    if (!useByBridgeAddress) return;
    const issuer = getInvoiceIssuerConfig('BYBRIDGE');
    const addr = String(issuer.addressLine ?? '').trim();
    if (addr) setMeetingVenue(addr);
  }, [useByBridgeAddress]);

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }
    const md = meetingDate.trim();
    const mv = meetingVenue.trim();
    const ch = chairman.trim();
    const nd = noticeDirector.trim();
    const fy = fiscalYearReport.trim();
    if (!md || !mv || !ch || !nd || !fy) {
      setSubmitError('Please fill in required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(companyId)}/annual-general-meeting-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meetingDate: md,
          meetingVenue: mv,
          chairman: ch,
          noticeDirector: nd,
          companyCategory: companyCategory || undefined,
          fiscalYearReport: fy,
          useByBridgeRegisteredOfficeAddress: useByBridgeAddress,
        }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok: boolean; request?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.ok || !j.request?.id) {
        setSubmitError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
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
                value={chairman}
                onChange={(e) => setChairman(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {shareholderPersons.map((s) => (
                  <option key={s.role.id} value={s.entity.person.fullName}>
                    {s.entity.person.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Noticed Director
              </div>
              <select
                value={noticeDirector}
                onChange={(e) => setNoticeDirector(e.target.value)}
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
          </div>

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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <div className="text-black">
                <span className="text-red-500">*</span> Date Of Meeting
              </div>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
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
          </div>

          <label className="text-sm">
            <div className="text-black">
              <span className="text-red-500">*</span> Meeting Venue
            </div>
            <textarea
              value={meetingVenue}
              onChange={(e) => setMeetingVenue(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-black/80">
            <input
              type="checkbox"
              checked={useByBridgeAddress}
              onChange={(e) => setUseByBridgeAddress(e.target.checked)}
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
