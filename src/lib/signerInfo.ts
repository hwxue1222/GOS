import type { Db } from '@/lib/types';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

function roleLabel(role: string) {
  if (role === 'DIRECTOR') return 'Director';
  if (role === 'SECRETARY') return 'Secretary';
  if (role === 'SHAREHOLDER') return 'Shareholder';
  if (role === 'RORC') return 'RORC';
  if (role === 'CORPORATE_REP') return 'Corporate rep';
  return role;
}

const rolePriority = ['DIRECTOR', 'SECRETARY', 'RORC', 'SHAREHOLDER', 'CORPORATE_REP'];

export function getSignerIdentityForClient(db: Db, clientId: string, email: string) {
  const emailKey = String(email ?? '').trim().toLowerCase();
  if (!emailKey) return { fullName: '', role: '' };

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));

  const roles: string[] = [];
  let fullName = '';
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if (String(person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    if (!fullName) fullName = String(person.fullName ?? '').trim();
    roles.push(r.role);
  }

  if (!fullName) {
    const p = db.persons.find((x) => String(x.email ?? '').trim().toLowerCase() === emailKey);
    fullName = String(p?.fullName ?? '').trim();
  }

  const chosen = rolePriority.find((p) => roles.includes(p)) ?? roles[0] ?? '';
  return { fullName, role: roleLabel(chosen) };
}

