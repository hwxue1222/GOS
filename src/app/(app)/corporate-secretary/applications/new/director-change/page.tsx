import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import ChangeDirectorClient from '@/app/(app)/corporate-secretary/applications/new/director-change/ui/ChangeDirectorClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

export default async function NewDirectorChangePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;

  const db = await readDb();
  const sp = await searchParams;
  const wantedCompanyId = (sp.companyId ?? '').trim();

  const allowedClientIds = (() => {
    if (me.role !== 'client') return null;
    const emailKey = me.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const allowed = new Set<string>();
    for (const r of db.clientPartyRoles) {
      if (!isActiveRole(r)) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowed.add(r.clientId);
    }
    return allowed;
  })();

  const companies = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => (allowedClientIds ? allowedClientIds.has(c.id) : true))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const companyId = companies.some((c) => c.id === wantedCompanyId) ? wantedCompanyId : companies[0]?.id ?? '';
  if (!companyId) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="corporate-secretary" />
        <div className="flex-1 bg-[#f7f8fa]">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">No companies</div>
          </div>
        </div>
      </div>
    );
  }

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const directors = db.clientPartyRoles
    .filter((r) => r.clientId === companyId)
    .filter((r) => r.role === 'DIRECTOR')
    .filter((r) => isActiveRole(r))
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return null;
      const person = personById.get(party.personId);
      if (!person) return null;
      const nat = String((person as { nationality?: unknown }).nationality ?? '').trim().toLowerCase();
      const isLocal = nat === 'singapore' || (nat.includes('singapore') && nat.includes('pr')) || nat === 'ep' || nat.includes('employment pass');
      return { roleId: r.id, fullName: person.fullName, isLocal };
    })
    .filter(Boolean) as Array<{ roleId: string; fullName: string; isLocal: boolean }>;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ChangeDirectorClient
          companyId={companyId}
          closeHref={`/portal/companies/${encodeURIComponent(companyId)}`}
          directors={directors}
        />
      </div>
    </div>
  );
}
