import Link from 'next/link';
import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { getDirectorChangeRequestContext, readDb } from '@/lib/db';
import { getSignerIdentityForClient } from '@/lib/signerInfo';
import SignaturesDocumentsCardClient from '@/app/(app)/corporate-secretary/applications/company-update/[requestId]/ui/SignaturesDocumentsCardClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
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

export default async function DirectorChangeApplicationDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { requestId } = await params;

  const ctx = await getDirectorChangeRequestContext(requestId);
  if (!ctx) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="corporate-secretary" />
        <div className="flex-1 bg-[#f7f8fa]">
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
          <AppTopNav active="corporate-secretary" />
          <div className="flex-1 bg-[#f7f8fa]">
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

  const docById = new Map(ctx.documents.map((d) => [d.id, d]));
  const docByPacketId = new Map(ctx.packets.map((p) => [p.id, docById.get(p.documentId) ?? null]));
  const signaturesByPacket = new Map<string, typeof ctx.signatures>();
  for (const s of ctx.signatures) {
    const arr = signaturesByPacket.get(s.packetId) ?? [];
    arr.push(s);
    signaturesByPacket.set(s.packetId, arr);
  }

  const addDirectorByEmail = new Map(r.addDirectors.map((d) => [String(d.email ?? '').trim().toLowerCase(), d]));

  const signatureRows = ctx.signatures
    .map((s) => {
      const doc = docByPacketId.get(s.packetId);
      const docTitle = doc?.title ?? s.packetId;
      const meta = getSignerIdentityForClient(db, r.clientId, s.email);
      const fromAdd = addDirectorByEmail.get(String(s.email ?? '').trim().toLowerCase());
      const signerName = meta.fullName || fromAdd?.fullName || '';
      const signerRole = meta.role || (fromAdd ? 'NEW_DIRECTOR' : '');
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
    .filter(Boolean) as Array<{ documentId: string; title: string; signerCount: number }>;

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const removedDirectors = db.clientPartyRoles
    .filter((x) => x.clientId === r.clientId)
    .filter((x) => x.role === 'DIRECTOR')
    .filter((x) => r.removeDirectorRoleIds.includes(x.id))
    .map((x) => {
      const party = partyById.get(x.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return '';
      const person = personById.get(party.personId);
      return person?.fullName ?? '';
    })
    .filter(Boolean);

  const statusLabel = r.status === 'PENDING_SIGNATURES' ? 'SIGNING' : r.status;
  const statusClass =
    r.status === 'PENDING_SIGNATURES'
      ? 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]'
      : r.status === 'PENDING_REVIEW'
        ? 'bg-[#faf5ff] text-[#6d28d9] border-[#e9d5ff]'
        : r.status === 'NEED_MORE_INFO'
          ? 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]'
          : r.status === 'APPROVED'
            ? 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]'
            : r.status === 'REJECTED'
              ? 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]'
              : 'bg-white text-black/70 border-black/10';

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 bg-[#f7f8fa]">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Change of Director</h1>
              <div className="mt-1 text-sm text-black/60">Request ID: {r.id}</div>
            </div>
            <Link href="/corporate-secretary/applications" className="text-sm text-[#2f7bdc] hover:underline">
              Back
            </Link>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-black/50">Status</div>
                <div className="mt-1">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
                </div>
              </div>
              <div>
                <div className="text-black/50">Effective date</div>
                <div className="mt-1 font-medium">{r.effectiveDate}</div>
              </div>
              <div>
                <div className="text-black/50">Submitted</div>
                <div className="mt-1 font-medium">{(r.submittedAt ?? r.createdAt).slice(0, 19).replace('T', ' ')}</div>
              </div>
            </div>
            {r.message?.trim() ? <div className="mt-3 text-sm whitespace-pre-wrap">{r.message}</div> : null}
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-medium">Changes</div>
            <div className="mt-2 text-sm">
              <div className="text-black/50">Add directors</div>
              <div className="mt-1">{r.addDirectors.length ? r.addDirectors.map((d) => d.fullName).filter(Boolean).join(', ') : '-'}</div>
            </div>
            <div className="mt-3 text-sm">
              <div className="text-black/50">Remove directors</div>
              <div className="mt-1">{removedDirectors.length ? removedDirectors.join(', ') : '-'}</div>
            </div>
            {r.useByBridgeNomineeDirector ? <div className="mt-3 text-xs text-black/50">Includes ByBridge nominee director service</div> : null}
          </div>

          <div className="mt-4">
            <SignaturesDocumentsCardClient signatureRows={signatureRows} documents={documents} />
          </div>
        </div>
      </div>
    </div>
  );
}
