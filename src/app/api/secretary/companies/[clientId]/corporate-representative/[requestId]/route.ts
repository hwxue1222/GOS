import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, deleteRepresentativeDesignationRequest, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function DELETE(_req: Request, ctx: { params: Promise<{ clientId: string; requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { clientId, requestId } = await ctx.params;
  const db = await readDb();
  const list = Array.isArray((db as any).representativeDesignationRequests)
    ? (((db as any).representativeDesignationRequests ?? []) as Array<any>)
    : [];
  const r = list.find((x) => String(x?.id ?? '') === requestId) ?? null;
  if (!r) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const companyParty = db.parties.find((p) => p.id === String(r.companyPartyId ?? '')) ?? null;
  const rdrClientId = companyParty && companyParty.type === 'COMPANY' ? String((companyParty as any).clientId ?? '').trim() : '';
  if (!rdrClientId || rdrClientId !== clientId) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const del = await deleteRepresentativeDesignationRequest({ requestId, deletedByUserId: user.id });
  if (!del.ok) return NextResponse.json({ ok: false, error: del.error }, { status: 400 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'delete_representative_designation_request',
    entityType: 'representative_designation_request',
    entityId: requestId,
    summary: `Delete corporate representative designation request: ${requestId}`,
  });

  return NextResponse.json({ ok: true });
}

