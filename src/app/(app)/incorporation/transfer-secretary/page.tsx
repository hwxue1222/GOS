import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import TransferSecretaryApplicationClient from '@/app/(app)/incorporation/ui/TransferSecretaryApplicationClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export default async function TransferSecretaryPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const db = await readDb();
  const companiesAll = db.clients.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, name: c.name }));

  const companies = (() => {
    if (me.role !== 'client') return companiesAll;
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
    return companiesAll.filter((c) => allowed.has(c.id));
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="incorporation" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Transfer of Company Secretary</h1>
          <div className="mt-4">
            {companies.length ? (
              <TransferSecretaryApplicationClient companies={companies} />
            ) : (
              <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">No companies</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
