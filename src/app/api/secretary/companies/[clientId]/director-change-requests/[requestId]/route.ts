import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, deleteDirectorChangeRequest, deleteRejectedDirectorChangeRequest, readDb } from '@/lib/db';
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ clientId: string; requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId, requestId } = await ctx.params;
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  if (user.role === 'client') {
    if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    const r = await deleteDirectorChangeRequest({ requestId, deletedByUserId: user.id });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    await appendAuditLog({
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      area: 'secretary',
      action: 'delete_director_change_request',
      entityType: 'director_change_request',
      entityId: requestId,
      summary: `Delete director change request: ${requestId}`,
    });
    return NextResponse.json({ ok: true });
  }

  if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  const r = await deleteRejectedDirectorChangeRequest({ requestId });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'delete_rejected_director_change_request',
    entityType: 'director_change_request',
    entityId: requestId,
    summary: `Delete rejected director change request: ${requestId}`,
  });
  return NextResponse.json({ ok: true });
}
