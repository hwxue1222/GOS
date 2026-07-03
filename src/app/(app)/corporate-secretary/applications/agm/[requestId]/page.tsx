import { getCurrentUser } from '@/lib/auth';
import { getAnnualGeneralMeetingRequestContext, readDb } from '@/lib/db';
import { getSignerIdentityForClient } from '@/lib/signerInfo';
import ApplicationDetailShell from '@/app/(app)/corporate-secretary/applications/ui/ApplicationDetailShell';
import ActivityTimelineCard from '@/app/(app)/corporate-secretary/applications/ui/ActivityTimelineCard';
import KeyValueCard from '@/app/(app)/corporate-secretary/applications/ui/KeyValueCard';
import SectionCard from '@/app/(app)/corporate-secretary/applications/ui/SectionCard';
import SignaturesDocumentsCardClient from '@/app/(app)/corporate-secretary/applications/ui/SignaturesDocumentsCardClient';
import StatusBadge from '@/app/(app)/corporate-secretary/applications/ui/StatusBadge';
import { auditLogsToTimelineItems, signatureEventsToTimelineItems } from '@/app/(app)/corporate-secretary/applications/ui/timeline';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canClientAccessRequest(user: { email: string }, clientId: string) {
  const db = await readDb();
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export default async function AgmApplicationDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { requestId } = await params;

  const ctx = await getAnnualGeneralMeetingRequestContext(requestId);
  if (!ctx) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  if (me.role === 'client') {
    const ok = await canClientAccessRequest(me, ctx.request.clientId);
    if (!ok) {
      return (
        <div className="min-h-screen flex flex-col">
          <div className="flex-1">
            <div className="max-w-6xl mx-auto px-4 py-6">
              <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
            </div>
          </div>
        </div>
      );
    }
  }

  const r = ctx.request;
  const db = await readDb();

  const isProxySubmitted = (() => {
    const createdByUserId = String((r as any).createdByUserId ?? '').trim();
    if (!createdByUserId) return false;
    const creator = db.users.find((u) => u.id === createdByUserId) ?? null;
    return !!creator && creator.role !== 'client';
  })();

  const company = db.clients.find((c) => c.id === r.clientId && !c.deletedAt) ?? null;
  const signatureRows = ctx.assets
    .flatMap((a) =>
      a.signatures.map((s) => {
        const meta = getSignerIdentityForClient(db, r.clientId, s.email);
        return {
          documentTitle: a.document.title,
          signerName: meta.fullName,
          signerRole: meta.role,
          email: s.email,
          status: s.status,
          signedAt: s.signedAt,
        };
      }),
    )
    .sort((a, b) => a.documentTitle.localeCompare(b.documentTitle) || a.email.localeCompare(b.email));
  const documents = ctx.assets.map((a) => ({ documentId: a.document.id, title: a.document.title, signerCount: a.signatures.length }));

  const summaryRows = [
    { label: 'Company', value: company?.name ?? r.clientId },
    { label: 'Type', value: 'Annual General Meeting' },
    { label: 'Status', value: r.status },
    { label: 'Meeting date', value: r.meetingDate },
    ...(r.meetingTime ? [{ label: 'Meeting time', value: r.meetingTime }] : []),
    { label: 'Chairman', value: r.chairman },
    ...(r.directorSendingNotice ? [{ label: 'Director sending notice', value: r.directorSendingNotice }] : []),
    ...(r.fiscalYearReport ? [{ label: 'Fiscal Financial Year Report', value: r.fiscalYearReport }] : []),
    ...(r.companyCategory ? [{ label: 'Company Category', value: r.companyCategory }] : []),
    { label: 'Venue', value: r.meetingVenue },
    { label: 'Submitted', value: (r.submittedAt ?? r.createdAt).slice(0, 10) },
  ];

  const auditLogs = (db.auditLogs ?? [])
    .filter((l) => l.entityType === 'annual_general_meeting_request' && l.entityId === r.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const timelineItems = [
    ...auditLogsToTimelineItems({ logs: auditLogs }),
    ...signatureEventsToTimelineItems({ signatures: signatureRows }),
  ];

  return (
    <ApplicationDetailShell
      title="Annual General Meeting"
      titleBadge={
        isProxySubmitted ? (
          <span className="inline-flex rounded-full border border-black/10 bg-black/[0.02] px-2 py-1 text-xs font-medium text-black/70">via Proxy</span>
        ) : null
      }
      requestId={r.id}
      statusBadge={<StatusBadge status={r.status} />}
      backHref={me.role === 'client' ? '/corporate-secretary/applications' : isProxySubmitted ? '/proxy' : '/secretary/acra-filing'}
      left={
        <>
          <KeyValueCard title="Overview" subtitle="Quick summary of the application." rows={summaryRows} right={<div className="text-xs text-black/50">Updated: {(r.updatedAt ?? r.createdAt).slice(0, 10)}</div>} />
          {r.agendaSummary?.trim() ? (
            <SectionCard title="Agenda" subtitle="Agenda summary for the meeting.">
              <div className="text-sm text-black/70 whitespace-pre-wrap">{r.agendaSummary}</div>
            </SectionCard>
          ) : null}
          <ActivityTimelineCard items={timelineItems} />
        </>
      }
      right={
        <>
          <SignaturesDocumentsCardClient id="assets" signatureRows={signatureRows} documents={documents} />
        </>
      }
    />
  );
}
