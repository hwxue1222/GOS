import { getCurrentUser } from '@/lib/auth';
import { getRepresentativeDesignationRequestContext, readDb } from '@/lib/db';
import { getSignerIdentityForClient } from '@/lib/signerInfo';
import ApplicationDetailShell from '@/app/(app)/corporate-secretary/applications/ui/ApplicationDetailShell';
import ActivityTimelineCard from '@/app/(app)/corporate-secretary/applications/ui/ActivityTimelineCard';
import KeyValueCard from '@/app/(app)/corporate-secretary/applications/ui/KeyValueCard';
import SectionCard from '@/app/(app)/corporate-secretary/applications/ui/SectionCard';
import SignaturesDocumentsCardClient from '@/app/(app)/corporate-secretary/applications/ui/SignaturesDocumentsCardClient';
import StatusBadge from '@/app/(app)/corporate-secretary/applications/ui/StatusBadge';
import { signatureEventsToTimelineItems } from '@/app/(app)/corporate-secretary/applications/ui/timeline';
import SignLinksOnceClient from './SignLinksOnceClient';

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

export default async function CorporateRepresentativeApplicationDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { requestId } = await params;

  const ctx = await getRepresentativeDesignationRequestContext(requestId);
  if (!ctx) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 bg-[#f7f8fa]">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  const r = ctx.request;
  const db = await readDb();
  const companyParty = db.parties.find((p) => p.id === r.companyPartyId) ?? null;
  const clientId = companyParty && companyParty.type === 'COMPANY' ? String(companyParty.clientId ?? '').trim() : '';
  const client = clientId ? db.clients.find((c) => c.id === clientId && !c.deletedAt) ?? null : null;

  if (me.role === 'client') {
    if (!clientId) {
      return (
        <div className="min-h-screen flex flex-col">
          <div className="flex-1 bg-[#f7f8fa]">
            <div className="max-w-6xl mx-auto px-4 py-6">
              <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
            </div>
          </div>
        </div>
      );
    }
    const ok = await canClientAccessRequest(me, clientId);
    if (!ok) {
      return (
        <div className="min-h-screen flex flex-col">
          <div className="flex-1 bg-[#f7f8fa]">
            <div className="max-w-6xl mx-auto px-4 py-6">
              <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
            </div>
          </div>
        </div>
      );
    }
  }

  const docById = new Map(ctx.documents.map((d) => [d.id, d]));
  const docByPacketId = new Map(ctx.packets.map((p) => [p.id, docById.get(p.documentId) ?? null]));
  const signaturesByPacket = new Map<string, typeof ctx.signatures>();
  for (const s of ctx.signatures) {
    const arr = signaturesByPacket.get(s.packetId) ?? [];
    arr.push(s);
    signaturesByPacket.set(s.packetId, arr);
  }

  const signatureRows = ctx.signatures
    .map((s) => {
      const doc = docByPacketId.get(s.packetId);
      const docTitle = doc?.title ?? s.packetId;
      const isRep = String(r.representativeEmail ?? '').trim().toLowerCase() === s.email.trim().toLowerCase();
      const meta = clientId ? getSignerIdentityForClient(db, clientId, s.email) : { fullName: '', role: '' };
      const signerName = (isRep ? String(r.representativeName ?? '') : meta.fullName) || '';
      const signerRole = (isRep ? 'Corporate Representative' : meta.role) || '';
      return {
        documentTitle: docTitle,
        signerName,
        signerRole,
        email: s.email,
        status: s.status,
        signedAt: s.signedAt,
      };
    })
    .sort((a, b) => (a.documentTitle !== b.documentTitle ? a.documentTitle.localeCompare(b.documentTitle) : a.email.localeCompare(b.email)));

  const documents = ctx.packets
    .map((p) => {
      const d = docById.get(p.documentId);
      if (!d) return null;
      const signerCount = (signaturesByPacket.get(p.id) ?? []).length;
      return { documentId: d.id, title: d.title, signerCount };
    })
    .filter(Boolean) as Array<{ documentId: string; title: string; signerCount: number }>
    ;

  const timelineItems = signatureEventsToTimelineItems({ signatures: signatureRows });

  const summaryRows = [
    { label: 'Company', value: (client?.name ?? clientId) || '-' },
    { label: 'Type', value: 'Appointment of (GLOBAL) Corporate Representative' },
    { label: 'Status', value: <span className="text-black/80">{r.status}</span> },
    { label: 'Representative', value: r.representativeName ?? '-' },
    { label: 'Email', value: r.representativeEmail ?? '-' },
    { label: 'Matters', value: r.matter ?? '-' },
    { label: 'Appointment date', value: r.appointmentDateYmd ?? '-' },
    { label: 'Submitted', value: (r.updatedAt ?? r.createdAt).slice(0, 10) },
    { label: 'Updated', value: (r.updatedAt ?? r.createdAt).slice(0, 10) },
  ];

  return (
    <ApplicationDetailShell
      title="Appointment of (GLOBAL) Corporate Representative"
      requestId={r.id}
      statusBadge={<StatusBadge status={r.status} />}
      backHref={me.role === 'client' ? '/corporate-secretary/applications' : '/proxy'}
      left={
        <>
          <KeyValueCard
            title="Overview"
            subtitle="Quick summary of the application."
            rows={summaryRows}
            right={<div className="text-xs text-black/50">Updated: {(r.updatedAt ?? r.createdAt).slice(0, 10)}</div>}
          />
          <SectionCard title="Requested changes" subtitle="What will be updated.">
            <div className="text-sm text-black/70">
              Designate {r.representativeName ?? 'a corporate representative'} for matters relating to {r.matter ?? 'signing documents'}.
            </div>
          </SectionCard>
          <SignLinksOnceClient requestId={r.id} />
          <ActivityTimelineCard items={timelineItems} />
        </>
      }
      right={<SignaturesDocumentsCardClient id="assets" signatureRows={signatureRows} documents={documents} />}
    />
  );
}
