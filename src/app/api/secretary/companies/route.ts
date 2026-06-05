import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const db = await readDb();
  const allClients = db.clients.filter((c) => !c.deletedAt);
  const canViewAll = hasPermission(user, 'secretary', 'viewAll');

  let clients = allClients;
  if (!canViewAll) {
    const emailKey = user.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const allowedClientIds = new Set<string>();
    for (const r of db.clientPartyRoles) {
      if (!isActiveRole(r)) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowedClientIds.add(r.clientId);
    }
    clients = allClients.filter((c) => allowedClientIds.has(c.id));
  }

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const rolesByClientId = new Map<string, Array<{ role: string; name: string }>>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    const list = rolesByClientId.get(r.clientId) ?? [];
    list.push({ role: r.role, name: person.fullName });
    rolesByClientId.set(r.clientId, list);
  }

  const items = clients
    .map((c) => {
      const roles = rolesByClientId.get(c.id) ?? [];
      const names = (role: string) =>
        roles
          .filter((x) => x.role === role)
          .map((x) => x.name)
          .sort((a, b) => a.localeCompare(b));
      return {
        client: c,
        directors: names('DIRECTOR'),
        shareholders: names('SHAREHOLDER'),
        rorc: names('RORC'),
        secretaries: names('SECRETARY'),
      };
    })
    .sort((a, b) => (a.client.createdAt ?? '').localeCompare(b.client.createdAt ?? ''));

  return NextResponse.json({ ok: true, items });
}

