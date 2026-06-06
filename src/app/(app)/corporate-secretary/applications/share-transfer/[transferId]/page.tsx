import Link from 'next/link';
import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';

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
        <AppTopNav active="corporate-secretary" />
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
          <AppTopNav active="corporate-secretary" />
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

  const staHref = staDoc ? `/api/documents/${encodeURIComponent(staDoc.id)}/pdf` : '';
  const brHref = brDoc ? `/api/documents/${encodeURIComponent(brDoc.id)}/pdf` : '';

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Transfer of Shares</h1>
              <div className="mt-1 text-sm text-black/60">Transfer ID: {transfer.id}</div>
            </div>
            <Link href="/corporate-secretary/applications" className="text-sm text-[#2f7bdc] hover:underline">
              Back
            </Link>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-black/50">Company</div>
                <div className="mt-1 font-medium">{client?.name ?? transfer.clientId}</div>
              </div>
              <div>
                <div className="text-black/50">Effective date</div>
                <div className="mt-1 font-medium">{transfer.effectiveDate}</div>
              </div>
              <div>
                <div className="text-black/50">Status</div>
                <div className="mt-1 font-medium">{transfer.status}</div>
              </div>
              <div>
                <div className="text-black/50">Shares</div>
                <div className="mt-1 font-medium">{transfer.shares.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-black/50">Share class</div>
                <div className="mt-1 font-medium">{transfer.shareClass ?? '-'}</div>
              </div>
              <div>
                <div className="text-black/50">Created</div>
                <div className="mt-1 font-medium">{transfer.createdAt.slice(0, 19).replace('T', ' ')}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-medium">Signatures</div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#f8fafc] border border-black/5 p-3">
                <div className="text-sm font-medium">Share Transfer Agreement</div>
                <div className="mt-2 space-y-2">
                  {staSigns.map((s) => (
                    <div key={s.id} className="rounded-md bg-white border border-black/5 px-3 py-2">
                      <div className="text-sm font-medium truncate">{s.email}</div>
                      <div className="mt-0.5 text-xs text-black/50">{s.status}{s.signedAt ? ` · ${s.signedAt.slice(0, 19).replace('T', ' ')}` : ''}</div>
                    </div>
                  ))}
                  {staSigns.length === 0 ? <div className="text-sm text-black/50">No signatures</div> : null}
                </div>
              </div>

              <div className="rounded-lg bg-[#f8fafc] border border-black/5 p-3">
                <div className="text-sm font-medium">Board Resolution</div>
                <div className="mt-2 space-y-2">
                  {brSigns.map((s) => (
                    <div key={s.id} className="rounded-md bg-white border border-black/5 px-3 py-2">
                      <div className="text-sm font-medium truncate">{s.email}</div>
                      <div className="mt-0.5 text-xs text-black/50">{s.status}{s.signedAt ? ` · ${s.signedAt.slice(0, 19).replace('T', ' ')}` : ''}</div>
                    </div>
                  ))}
                  {brSigns.length === 0 ? <div className="text-sm text-black/50">No signatures</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div id="documents" className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-medium">Documents</div>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              {staDoc ? (
                <a href={staHref} className="rounded-md bg-[#14b8a6] text-white px-4 py-2 text-sm font-medium">
                  Download STA PDF
                </a>
              ) : null}
              {brDoc ? (
                <a href={brHref} className="rounded-md bg-[#14b8a6] text-white px-4 py-2 text-sm font-medium">
                  Download BR PDF
                </a>
              ) : null}
              {!staDoc && !brDoc ? <div className="text-sm text-black/50">No documents</div> : null}
            </div>
            <div className="mt-2 text-xs text-black/50">Documents are generated from the signed document HTML.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

