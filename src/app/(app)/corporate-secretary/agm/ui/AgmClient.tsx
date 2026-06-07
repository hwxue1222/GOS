'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import { useCompanyContext } from '@/app/(app)/corporate-secretary/ui/useCompanyContext';

export default function AgmClient() {
  const router = useRouter();
  const { companyId, client, loading, error, closeHref } = useCompanyContext();

  const [meetingDate, setMeetingDate] = useState('');
  const [meetingVenue, setMeetingVenue] = useState('');
  const [chairman, setChairman] = useState('');
  const [agendaSummary, setAgendaSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit() {
    setSubmitError(null);
    if (!companyId || !client) {
      setSubmitError('NO_COMPANY');
      return;
    }
    const md = meetingDate.trim();
    const mv = meetingVenue.trim();
    const ch = chairman.trim();
    if (!md || !mv || !ch) {
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
          agendaSummary: agendaSummary.trim() || undefined,
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
          <label className="text-sm">
            <div className="text-black">
              <span className="text-red-500">*</span> Meeting date
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
              <span className="text-red-500">*</span> Chairman
            </div>
            <input
              value={chairman}
              onChange={(e) => setChairman(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <div className="text-black">
              <span className="text-red-500">*</span> Meeting venue
            </div>
            <input
              value={meetingVenue}
              onChange={(e) => setMeetingVenue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <div className="text-black/60">Agenda summary (optional)</div>
            <textarea
              value={agendaSummary}
              onChange={(e) => setAgendaSummary(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
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

