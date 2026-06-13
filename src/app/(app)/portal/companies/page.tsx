import { redirect } from 'next/navigation';

import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

export default async function PortalCompaniesIndexPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const db = await readDb();
  if (me.role !== 'client') {
    const first = db.clients.find((c) => !c.deletedAt) ?? null;
    if (first) redirect(`/portal/companies/${encodeURIComponent(first.id)}`);
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="dashboard" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">NO_COMPANIES</div>
          </div>
        </div>
      </div>
    );
  }

  const emailKey = me.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const allowed = new Set<string>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveDirector(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    allowed.add(r.clientId);
  }

  const first = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => allowed.has(c.id))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))[0];

  if (first) redirect(`/portal/companies/${encodeURIComponent(first.id)}`);

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="dashboard" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">NO_COMPANIES</div>
        </div>
      </div>
    </div>
  );
}
