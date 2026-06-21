import FrontTopNavClient from '@/components/FrontTopNavClient';
import ProfileClient from '@/app/(app)/profile/ui/ProfileClient';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

export default async function PortalProfilePage() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'client') return null;

  const db = await readDb();
  const emailKey = me.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const allowedCompanyIds = new Set<string>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveDirector(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    allowedCompanyIds.add(r.clientId);
  }
  const companies = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => allowedCompanyIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, code: c.code, isStruckOff: (c as any).isStruckOff }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));

  return (
    <div className="min-h-screen flex flex-col text-black">
      <FrontTopNavClient active="dashboard" user={me} companies={companies} />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Profile</h1>
          <ProfileClient initialUser={{ id: me.id, name: me.name, email: me.email }} />
        </div>
      </div>
    </div>
  );
}
