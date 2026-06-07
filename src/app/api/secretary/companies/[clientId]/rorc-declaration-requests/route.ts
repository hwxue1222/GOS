import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, createRorcDeclarationRequest, readDb } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';
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

function resolveBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = (h.get('x-forwarded-proto') || 'https').split(',')[0]!.trim();
  if (host) return `${proto}://${host}`;

  return new URL(req.url).origin;
}

export async function POST(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await ctx.params;
  if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (user.role !== 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        effectiveDate?: string;
        message?: string;
        removeRorcRoleIds?: unknown;
        addControllers?: unknown;
      }
    | null;

  const effectiveDate = typeof body?.effectiveDate === 'string' ? body.effectiveDate.trim() : '';
  const message = typeof body?.message === 'string' ? body.message : undefined;
  const removeRorcRoleIds = Array.isArray(body?.removeRorcRoleIds) ? body.removeRorcRoleIds : [];
  const addControllers = Array.isArray(body?.addControllers) ? body.addControllers : [];

  const r = await createRorcDeclarationRequest({
    clientId,
    createdByUserId: user.id,
    effectiveDate,
    message,
    removeRorcRoleIds: removeRorcRoleIds as string[],
    addControllers: addControllers as Array<{ fullName: string; email?: string }>,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'create_rorc_declaration_request',
    entityType: 'rorc_declaration_request',
    entityId: r.request.id,
    summary: `Create RORC declaration request: ${r.request.id}`,
  });

  const baseUrl = resolveBaseUrl(req);
  await Promise.all(
    r.signLinks.map((l) =>
      sendSigningInvite({ to: l.email, title: `RORC Declaration - ${clientId}`, url: `${baseUrl}${l.url}` }),
    ),
  );

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'send_rorc_declaration_invites',
    entityType: 'rorc_declaration_request',
    entityId: r.request.id,
    summary: `Send RORC declaration signature invites: ${r.request.id}`,
  });

  return NextResponse.json({ ok: true, request: r.request, signLinks: r.signLinks });
}

