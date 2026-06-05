import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addClientRole, endClientRole, readDb, updateClientShareholderShares } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

async function canAccessClient(user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
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

export async function POST(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await ctx.params;
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { personId?: string; companyClientId?: string; role?: string; shares?: number | string }
    | null;
  const personId = body?.personId?.trim() ?? '';
  const companyClientId = body?.companyClientId?.trim() ?? '';
  const roleRaw = body?.role?.trim() ?? '';
  const role = (['DIRECTOR', 'SHAREHOLDER', 'RORC', 'SECRETARY'] as const).find((x) => x === roleRaw) ?? null;
  const sharesRaw = body?.shares;
  const shares =
    typeof sharesRaw === 'number'
      ? sharesRaw
      : typeof sharesRaw === 'string' && sharesRaw.trim()
        ? Number(sharesRaw)
        : undefined;
  if ((!personId && !companyClientId) || !role) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }
  if (role !== 'SHAREHOLDER' && companyClientId) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }
  const r = await addClientRole({ clientId, role, personId: personId || undefined, companyClientId: companyClientId || undefined, shares });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await ctx.params;
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { roleId?: string; shares?: number | string } | null;
  const roleId = body?.roleId?.trim() ?? '';
  const sharesRaw = body?.shares;
  const shares =
    typeof sharesRaw === 'number'
      ? sharesRaw
      : typeof sharesRaw === 'string' && sharesRaw.trim()
        ? Number(sharesRaw)
        : NaN;
  if (!roleId || !Number.isFinite(shares)) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const r = await updateClientShareholderShares({ clientId, roleId, shares });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await ctx.params;
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { roleId?: string } | null;
  const roleId = body?.roleId?.trim() ?? '';
  if (!roleId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const updated = await endClientRole({ clientId, roleId });
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
