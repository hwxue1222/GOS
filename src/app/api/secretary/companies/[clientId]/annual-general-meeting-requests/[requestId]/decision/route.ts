import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, decideAnnualGeneralMeetingRequest, readDb } from '@/lib/db';
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

export async function POST(req: Request, ctx: { params: Promise<{ clientId: string; requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId, requestId } = await ctx.params;
  if (!hasPermission(user, 'secretary', 'update') || user.role === 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        decision?: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
        note?: string;
      }
    | null;

  const decision = body?.decision;
  if (decision !== 'APPROVE' && decision !== 'REJECT' && decision !== 'NEED_MORE_INFO') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const r = await decideAnnualGeneralMeetingRequest({
    requestId,
    decidedByUserId: user.id,
    decision,
    note: body?.note,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  if (r.request.clientId !== clientId) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: `agm_${decision.toLowerCase()}`,
    entityType: 'annual_general_meeting_request',
    entityId: requestId,
    summary: `AGM request ${decision}: ${requestId}`,
  });

  return NextResponse.json({ ok: true, request: r.request });
}

