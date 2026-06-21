import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canAccessClientAsDirector(user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
  const db = await readDb();
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveDirector(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export async function GET(_req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await ctx.params;

  const proxyCompanyId = (_req.headers.get('x-gos-proxy-company-id') ?? '').trim();
  const canProxy = hasPermission(user, 'proxy', 'viewAll') || hasPermission(user, 'proxy', 'viewAssigned');

  if (user.role !== 'client') {
    const canViewSecretary = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canViewSecretary && !(user.role === 'staff' && canProxy)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  if (user.role === 'staff' && canProxy && proxyCompanyId && proxyCompanyId !== clientId) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  if (!(await canAccessClientAsDirector(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const db = await readDb();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));

  const directors = db.clientPartyRoles
    .filter((r) => r.clientId === clientId)
    .filter((r) => isActiveDirector(r))
    .map((r) => partyById.get(r.partyId) ?? null)
    .filter((p): p is NonNullable<typeof p> => !!p && p.type === 'PERSON' && !!p.personId)
    .map((p) => personById.get(p.personId!) ?? null)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ personId: p.id, fullName: p.fullName, email: p.email ?? '' }));

  return NextResponse.json({ ok: true, directors });
}
