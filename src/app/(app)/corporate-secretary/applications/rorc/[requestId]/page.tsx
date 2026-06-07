import Link from 'next/link';
import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { getRorcDeclarationRequestContext, readDb } from '@/lib/db';

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

export default async function RorcApplicationDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { requestId } = await params;

  const ctx = await getRorcDeclarationRequestContext(requestId);
  if (!ctx) {
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
    const ok = await canClientAccessRequest(me, ctx.request.clientId);
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

  const r = ctx.request;
  const docHref = `/api/documents/${encodeURIComponent(ctx.document.id)}/pdf?download=1`;
  const previewHref = `/api/documents/${encodeURIComponent(ctx.document.id)}/pdf?disposition=inline`;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Declaration of Company Controller (RORC)</h1>
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
                <div className="mt-1 font-medium">{r.status}</div>
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
              <div className="text-black/50">Add controllers</div>
              <div className="mt-1">{r.addControllers.length ? r.addControllers.map((d) => d.fullName).join(', ') : '-'}</div>
            </div>
            <div className="mt-3 text-sm">
              <div className="text-black/50">Remove controller role IDs</div>
              <div className="mt-1 font-mono text-xs break-all">{r.removeRorcRoleIds.length ? r.removeRorcRoleIds.join(', ') : '-'}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-medium">Signatures</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ctx.signatures.map((s) => (
                <div key={s.id} className="rounded-md bg-[#f8fafc] border border-black/5 px-3 py-2">
                  <div className="text-sm font-medium truncate">{s.email}</div>
                  <div className="mt-0.5 text-xs text-black/50">
                    {s.status}{s.signedAt ? ` · ${s.signedAt.slice(0, 19).replace('T', ' ')}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="documents" className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Documents</div>
                <div className="mt-0.5 text-xs text-black/50">PDF is generated from the signed document HTML.</div>
              </div>
              <div className="flex items-center gap-2">
                <a href={previewHref} target="_blank" rel="noreferrer" className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium">
                  Preview
                </a>
                <a href={docHref} target="_blank" rel="noreferrer" className="rounded-md bg-[#14b8a6] text-white px-4 py-2 text-sm font-medium">
                  Download PDF
                </a>
              </div>
            </div>
            <div className="mt-2 text-xs text-black/50">{ctx.document.title}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
