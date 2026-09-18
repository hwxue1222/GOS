import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canAccessClient(user: { role: string; email: string }, clientId: string) {
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

function clampLimit(raw: string | null) {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

export async function GET(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const proxyCompanyId = (req.headers.get('x-gos-proxy-company-id') ?? '').trim();
  const canProxy = hasPermission(user, 'proxy', 'viewAll') || hasPermission(user, 'proxy', 'viewAssigned');

  if (user.role !== 'client') {
    const canViewSecretary = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canViewSecretary && !(user.role === 'staff' && canProxy)) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  }

  const { clientId } = await ctx.params;
  if (user.role === 'staff' && canProxy && proxyCompanyId && proxyCompanyId !== clientId) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'));

  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId && !c.deletedAt) ?? null;
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const logs = (db.auditLogs ?? [])
    .filter((l) => String(l.entityType ?? '').trim() === 'client')
    .filter((l) => String(l.entityId ?? '').trim() === clientId)
    .slice()
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, limit);

  return NextResponse.json({ ok: true, logs }, { headers: { 'cache-control': 'no-store' } });
}
