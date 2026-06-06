import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, deletePerson, findPersonById, updatePerson } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function PATCH(req: Request, ctx: { params: Promise<{ personId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'people', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { personId } = await ctx.params;
  const existing = await findPersonById(personId);
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | {
        fullName?: string;
        email?: string;
        phone?: string;
        idType?: 'NRIC' | 'PASSPORT' | 'OTHER';
        idNo?: string;
        nationality?: string;
        dob?: string;
        address?: string;
        memberSince?: string;
        lastLoginDate?: string;
      }
    | null;

  const patch: Parameters<typeof updatePerson>[1] = {};
  const has = (k: string) => !!body && Object.prototype.hasOwnProperty.call(body, k);
  if (has('fullName') && typeof body?.fullName === 'string') patch.fullName = body.fullName.trim();
  if (has('email') && typeof body?.email === 'string') patch.email = body.email.trim() || undefined;
  if (has('phone') && typeof body?.phone === 'string') patch.phone = body.phone.trim() || undefined;
  if (has('idType')) patch.idType = body?.idType;
  if (has('idNo') && typeof body?.idNo === 'string') patch.idNo = body.idNo.trim() || undefined;
  if (has('nationality') && typeof body?.nationality === 'string') patch.nationality = body.nationality.trim() || undefined;
  if (has('dob') && typeof body?.dob === 'string') patch.dob = body.dob.trim() || undefined;
  if (has('address') && typeof body?.address === 'string') patch.address = body.address.trim() || undefined;
  if (has('memberSince') && typeof body?.memberSince === 'string') patch.memberSince = body.memberSince.trim() || undefined;
  if (has('lastLoginDate') && typeof body?.lastLoginDate === 'string') patch.lastLoginDate = body.lastLoginDate.trim() || undefined;

  const updated = await updatePerson(personId, patch);
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'members',
    action: 'update',
    entityType: 'person',
    entityId: personId,
    summary: `Update member: ${updated.fullName}`,
  });
  return NextResponse.json({ ok: true, person: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ personId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'people', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { personId } = await ctx.params;
  const existing = await findPersonById(personId);
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const deleted = await deletePerson(personId);
  if (!deleted) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'members',
    action: 'delete',
    entityType: 'person',
    entityId: personId,
    summary: `Delete member: ${existing.fullName}`,
  });
  return NextResponse.json({ ok: true });
}
