import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, deleteRejectedShareTransfer, deleteShareTransfer, readDb } from '@/lib/db';
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ transferId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { transferId } = await ctx.params;
  const db = await readDb();
  const t = db.shareTransfers.find((x) => x.id === transferId) ?? null;
  if (!t) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (user.role !== 'client') {
    if (!hasPermission(user, 'secretary', 'update')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    const st = String((t as any).status ?? '');
    const auditLogs = Array.isArray((db as any).auditLogs) ? ((db as any).auditLogs as Array<any>) : [];
    const createdByLog =
      auditLogs
        .filter((l) => l?.area === 'secretary' && l?.action === 'create_share_transfer' && l?.entityType === 'share_transfer' && l?.entityId === t.id)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0] ?? null;
    const createdByMe = createdByLog && String(createdByLog.actorUserId ?? '') === user.id;

    if (st === 'REJECTED') {
      const r = await deleteRejectedShareTransfer({ transferId });
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
      await appendAuditLog({
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        area: 'secretary',
        action: 'delete_rejected_share_transfer',
        entityType: 'share_transfer',
        entityId: transferId,
        summary: `Delete rejected share transfer: ${transferId}`,
      });
      return NextResponse.json({ ok: true });
    }

    if (!createdByMe) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  } else {
    if (!(await canAccessClientAsDirector(user, t.clientId))) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  }

  const r = await deleteShareTransfer({ transferId });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'delete_share_transfer',
    entityType: 'share_transfer',
    entityId: transferId,
    summary: `Delete share transfer: ${transferId}`,
  });
  return NextResponse.json({ ok: true });
}
