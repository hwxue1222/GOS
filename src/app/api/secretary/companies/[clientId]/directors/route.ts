import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addClientDirector, appendAuditLog, findClientById, listClientDirectors } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveDirectorRole(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canAccessClientAsDirector(user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
  const { readDb } = await import('@/lib/db');
  const db = await readDb();
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveDirectorRole(r as any)) continue;
    const party = partyById.get((r as any).partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (user.role !== 'client') {
    const canViewSecretary = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canViewSecretary) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await canAccessClientAsDirector(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeResigned = url.searchParams.get('includeResigned') === '1';
  const directors = await listClientDirectors(clientId, { includeResigned });
  return NextResponse.json({ ok: true, directors }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { fullName?: string; email?: string; phone?: string; appointmentDate?: string }
    | null;
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  if (!fullName) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const email = typeof body?.email === 'string' ? body.email.trim() || undefined : undefined;
  const phone = typeof body?.phone === 'string' ? body.phone.trim() || undefined : undefined;
  const appointmentDate = typeof body?.appointmentDate === 'string' ? body.appointmentDate.trim() || undefined : undefined;

  const created = await addClientDirector({ clientId, fullName, email, phone, appointmentDate });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'add_director',
    entityType: 'client',
    entityId: clientId,
    summary: `Add director for client: ${clientId}`,
  });
  return NextResponse.json({ ok: true, director: created });
}

