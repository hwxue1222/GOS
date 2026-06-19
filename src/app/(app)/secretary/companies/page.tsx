import AppTopNav from '@/components/AppTopNav';
import SecretaryCompaniesClient from '@/app/(app)/secretary/companies/ui/SecretaryCompaniesClient';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

function isExternalCompanyCode(code: unknown) {
  const c = String(code ?? '').trim();
  return /^SC/i.test(c);
}

export default async function SecretaryCompaniesPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!hasPermission(me, 'secretary', 'viewAll') && !hasPermission(me, 'secretary', 'viewAssigned')) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const db = await readDb();
  const allClients = db.clients.filter((c) => !c.deletedAt).filter((c) => !isExternalCompanyCode(c.code));
  const canViewAll = hasPermission(me, 'secretary', 'viewAll');
  let clients = allClients;
  if (!canViewAll) {
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
    clients = allClients.filter((c) => allowed.has(c.id));
  }

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const clientById = new Map(db.clients.map((c) => [c.id, c]));
  const externalById = new Map(db.externalCompanies.map((c) => [c.id, c]));
  const rolesByClientId = new Map<string, Array<{ role: string; name: string; shares?: number }>>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party) continue;
    let name: string | null = null;
    if (party.type === 'PERSON' && party.personId) {
      const person = personById.get(party.personId);
      if (person) name = person.fullName;
    } else if (party.type === 'COMPANY') {
      if (party.clientId) {
        const c = clientById.get(party.clientId);
        if (c && !c.deletedAt) name = c.name;
      } else if (party.externalCompanyId) {
        name = externalById.get(party.externalCompanyId)?.name ?? null;
      } else {
        name = party.displayName || null;
      }
    }
    if (!name) name = party.displayName || null;
    if (!name) continue;
    const list = rolesByClientId.get(r.clientId) ?? [];
    list.push({ role: r.role, name, shares: r.role === 'SHAREHOLDER' ? r.shares : undefined });
    rolesByClientId.set(r.clientId, list);
  }

  const items = clients
    .map((c) => {
      const roles = rolesByClientId.get(c.id) ?? [];
      const names = (role: string) =>
        roles
          .filter((x) => x.role === role)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((x) => {
            if (role !== 'SHAREHOLDER') return x.name;
            const shares = typeof x.shares === 'number' && Number.isFinite(x.shares) ? x.shares : undefined;
            return shares !== undefined ? `${x.name} (${shares.toLocaleString()})` : x.name;
          });
      return {
        client: c,
        directors: names('DIRECTOR'),
        shareholders: names('SHAREHOLDER'),
        rorc: names('RORC'),
        secretaries: names('SECRETARY'),
      };
    })
    .sort((a, b) => (a.client.createdAt ?? '').localeCompare(b.client.createdAt ?? ''));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <div className="flex-1">
        <SecretaryCompaniesClient
          initialItems={items}
          canViewPeople={me.role !== 'client'}
          activeSection="companies"
        />
      </div>
    </div>
  );
}
