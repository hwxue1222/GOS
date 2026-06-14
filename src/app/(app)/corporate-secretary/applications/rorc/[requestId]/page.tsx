import { getCurrentUser } from '@/lib/auth';
import { getRorcDeclarationRequestContext, readDb } from '@/lib/db';
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

export default async function RorcApplicationDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { requestId } = await params;

  const ctx = await getRorcDeclarationRequestContext(requestId);
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

  const company = db.clients.find((c) => c.id === r.clientId && !c.deletedAt) ?? null;
  const packetById = new Map(ctx.packets.map((p) => [p.id, p]));
  const docById = new Map(ctx.documents.map((d) => [d.id, d]));

  const signatureRows = ctx.signatures
    .map((s) => {
      const packet = packetById.get(s.packetId) ?? null;
      const doc = packet ? docById.get(packet.documentId) ?? null : null;
      const meta = getSignerIdentityForClient(db, r.clientId, s.email);
      return {
        documentTitle: doc?.title ?? s.packetId,
        signerName: meta.fullName,
        signerRole: meta.role,
        email: s.email,
        status: s.status,
        signedAt: s.signedAt,
      };
    })
    .sort((a, b) => (a.documentTitle !== b.documentTitle ? a.documentTitle.localeCompare(b.documentTitle) : a.email.localeCompare(b.email)));

  const documents = ctx.packets
    .map((p) => {
      const doc = docById.get(p.documentId) ?? null;
      if (!doc) return null;
      const signerEmails = ctx.signatures
        .filter((s) => s.packetId === p.id)
        .map((s) => (s.email ?? '').trim().toLowerCase())
        .filter(Boolean);
      const signerCount = new Set(signerEmails).size;
      return { documentId: doc.id, title: doc.title, signerCount };
    })
    .filter(Boolean) as Array<{ documentId: string; title: string; signerCount: number }>;

  const summaryRows = [
    { label: 'Company', value: company?.name ?? r.clientId },
    { label: 'Type', value: 'Declaration of Company Controller (RORC)' },
    { label: 'Status', value: r.status },
    { label: 'Effective date', value: r.effectiveDate },
    ...(r.controllerType ? [{ label: 'Controller type', value: r.controllerType }] : []),
    { label: 'Submitted', value: (r.submittedAt ?? r.createdAt).slice(0, 10) },
    { label: 'Updated', value: (r.updatedAt ?? r.createdAt).slice(0, 10) },
  ];

  const addNames = r.addControllers.map((d) => d.fullName).filter(Boolean).join(', ') || '-';
  const removeIds = r.removeRorcRoleIds.length ? r.removeRorcRoleIds.join(', ') : '-';

  const auditLogs = (db.auditLogs ?? [])
    .filter((l) => l.entityType === 'rorc_declaration_request' && l.entityId === r.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const timelineItems = [
    ...auditLogsToTimelineItems({ logs: auditLogs }),
    ...signatureEventsToTimelineItems({ signatures: signatureRows }),
  ];

  return (
    <ApplicationDetailShell
      title="Declaration of Company Controller (RORC)"
      requestId={r.id}
      statusBadge={<StatusBadge status={r.status} />}
      left={
        <>
          <KeyValueCard title="Overview" subtitle="Quick summary of the application." rows={summaryRows} right={<div className="text-xs text-black/50">Updated: {(r.updatedAt ?? r.createdAt).slice(0, 10)}</div>} />
          <SectionCard title="Requested changes" subtitle="What will be added or removed.">
            {r.controllerType ? (
              <div className="space-y-3 text-sm">
                {r.controllerType === 'PERSON' ? (
                  <>
                    <div>
                      <div className="text-black/50">Personal controller</div>
                      <div className="mt-1 text-black/80">{r.controllerPerson?.fullName ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-black/50">Email</div>
                      <div className="mt-1 text-black/80">
                        {(r.controllerPerson?.useCcEmailInstead ? r.controllerPerson?.ccEmailAddress : r.controllerPerson?.email) ?? '-'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-black/50">Company controller</div>
                      <div className="mt-1 text-black/80">{r.controllerCompany?.companyName ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-black/50">Register number</div>
                      <div className="mt-1 text-black/80">{r.controllerCompany?.registerNumber ?? '-'}</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-black/50">Add controllers</div>
                  <div className="mt-1 text-black/80">{addNames}</div>
                </div>
                <div>
                  <div className="text-black/50">Remove controller role IDs</div>
                  <div className="mt-1 font-mono text-xs break-all text-black/70">{removeIds}</div>
                </div>
              </div>
            )}
          </SectionCard>
          {r.message?.trim() ? (
            <SectionCard title="Message" subtitle="Notes provided when submitting this request.">
              <div className="text-sm text-black/70 whitespace-pre-wrap">{r.message}</div>
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
