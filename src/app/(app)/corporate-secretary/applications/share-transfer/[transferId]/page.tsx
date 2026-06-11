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
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
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
  const staPacket = db.signaturePackets.find((p) => p.id === transfer.staPacketId) ?? null;
  const brPacket = db.signaturePackets.find((p) => p.id === transfer.brPacketId) ?? null;
  const staDoc = staPacket ? db.documents.find((d) => d.id === staPacket.documentId) ?? null : null;
  const brDoc = brPacket ? db.documents.find((d) => d.id === brPacket.documentId) ?? null : null;

  const staSigns = staPacket ? db.signatureRequests.filter((r) => r.packetId === staPacket.id) : [];
  const brSigns = brPacket ? db.signatureRequests.filter((r) => r.packetId === brPacket.id) : [];

  const signatureRows = [...staSigns.map((s) => ({ s, doc: staDoc })), ...brSigns.map((s) => ({ s, doc: brDoc }))]
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
    .sort((a, b) => (a.documentTitle !== b.documentTitle ? a.documentTitle.localeCompare(b.documentTitle) : a.email.localeCompare(b.email)));

  const documents = [
    staDoc ? { documentId: staDoc.id, title: staDoc.title, signerCount: staSigns.length } : null,
    brDoc ? { documentId: brDoc.id, title: brDoc.title, signerCount: brSigns.length } : null,
  ].filter(Boolean) as Array<{ documentId: string; title: string; signerCount: number }>;

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
          <SectionCard title="Actions" subtitle="Shortcuts for common tasks.">
            <div className="space-y-2">
              <a
                href="#assets"
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#2f7bdc] text-white px-4 py-2.5 text-sm font-medium hover:opacity-95"
              >
                View signatures & documents
              </a>
              <a
                href="/corporate-secretary/applications"
                className="inline-flex w-full items-center justify-center rounded-lg bg-white border border-black/10 text-black/70 px-4 py-2.5 text-sm font-medium hover:bg-black/[0.02]"
              >
                Back to applications
              </a>
              {transfer.status === 'BLOCKED_REPRESENTATIVE' ? (
                <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-3 text-xs text-[#c2410c]">
                  This transfer is blocked and requires representative action.
                </div>
              ) : null}
            </div>
          </SectionCard>
          <SignaturesDocumentsCardClient id="assets" signatureRows={signatureRows} documents={documents} />
        </>
      }
    />
  );
}
