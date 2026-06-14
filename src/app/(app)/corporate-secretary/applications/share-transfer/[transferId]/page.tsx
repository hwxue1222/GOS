import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
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

async function canClientAccessTransfer(user: { email: string }, clientId: string) {
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

export default async function ShareTransferApplicationDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { transferId } = await params;

  const db = await readDb();
  const transfer = db.shareTransfers.find((t) => t.id === transferId) ?? null;
  if (!transfer) {
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
    const ok = await canClientAccessTransfer(me, transfer.clientId);
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

  const client = db.clients.find((c) => c.id === transfer.clientId) ?? null;
  const packets = db.signaturePackets
    .filter((p) => p.relatedType === 'SHARE_TRANSFER' && p.relatedId === transfer.id)
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind));
  const docById = new Map(db.documents.map((d) => [d.id, d]));

  const signatureRows = packets
    .flatMap((p) => {
      const doc = docById.get(p.documentId) ?? null;
      const signs = db.signatureRequests.filter((r) => r.packetId === p.id);
      return signs.map((s) => ({ s, doc }));
    })
    .map(({ s, doc }) => {
      const meta = getSignerIdentityForClient(db, transfer.clientId, s.email);
      return {
        documentTitle: doc?.title ?? s.packetId,
        signerName: meta.fullName,
        signerRole: meta.role,
        email: s.email,
        status: s.status,
        signedAt: s.signedAt,
      };
    })
    .sort((a, b) =>
      a.documentTitle !== b.documentTitle ? a.documentTitle.localeCompare(b.documentTitle) : a.email.localeCompare(b.email),
    );

  const documents = packets
    .map((p) => {
      const doc = docById.get(p.documentId) ?? null;
      if (!doc) return null;
      const signerEmails = db.signatureRequests
        .filter((r) => r.packetId === p.id)
        .map((r) => (r.email ?? '').trim().toLowerCase())
        .filter(Boolean);
      const signerCount = p.kind === 'STA' ? Math.max(2, new Set(signerEmails).size) : new Set(signerEmails).size;
      return { documentId: doc.id, title: doc.title, signerCount };
    })
    .filter(Boolean) as Array<{ documentId: string; title: string; signerCount: number }>;

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const transferorParty = partyById.get(transfer.transferorPartyId) ?? null;
  const transfereeParty = partyById.get(transfer.transfereePartyId) ?? null;
  const transferorName = transferorParty?.type === 'PERSON' && transferorParty.personId ? personById.get(transferorParty.personId)?.fullName ?? transferorParty.displayName : transferorParty?.displayName;
  const transfereeName = transfereeParty?.type === 'PERSON' && transfereeParty.personId ? personById.get(transfereeParty.personId)?.fullName ?? transfereeParty.displayName : transfereeParty?.displayName;

  const summaryRows = [
    { label: 'Company', value: client?.name ?? transfer.clientId },
    { label: 'Status', value: transfer.status },
    { label: 'Effective date', value: transfer.effectiveDate },
    { label: 'Shares', value: transfer.shares.toLocaleString() },
    { label: 'Share class', value: transfer.shareClass ?? '-' },
    { label: 'Created', value: transfer.createdAt.slice(0, 10) },
    { label: 'Updated', value: (transfer.updatedAt ?? transfer.createdAt).slice(0, 10) },
  ];

  const auditLogs = (db.auditLogs ?? [])
    .filter((l) => l.entityType === 'share_transfer' && l.entityId === transfer.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const timelineItems = [
    ...auditLogsToTimelineItems({ logs: auditLogs }),
    ...signatureEventsToTimelineItems({ signatures: signatureRows }),
  ];

  return (
    <ApplicationDetailShell
      title="Transfer of Shares"
      requestId={transfer.id}
      statusBadge={<StatusBadge status={transfer.status} />}
      left={
        <>
          <KeyValueCard title="Overview" subtitle="Quick summary of the application." rows={summaryRows} right={<div className="text-xs text-black/50">Updated: {(transfer.updatedAt ?? transfer.createdAt).slice(0, 10)}</div>} />
          <SectionCard title="Transfer details" subtitle="Parties and shares being transferred.">
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-black/50">Transferor</div>
                <div className="mt-1 text-black/80">{transferorName || transfer.transferorPartyId}</div>
              </div>
              <div>
                <div className="text-black/50">Transferee</div>
                <div className="mt-1 text-black/80">{transfereeName || transfer.transfereePartyId}</div>
              </div>
            </div>
          </SectionCard>
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
