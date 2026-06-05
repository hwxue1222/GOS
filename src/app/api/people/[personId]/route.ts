import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findPersonById, updatePerson } from '@/lib/db';
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

  const patch = {
    fullName: typeof body?.fullName === 'string' ? body.fullName.trim() : undefined,
    email: typeof body?.email === 'string' ? body.email.trim() || undefined : undefined,
    phone: typeof body?.phone === 'string' ? body.phone.trim() || undefined : undefined,
    idType: body?.idType,
    idNo: typeof body?.idNo === 'string' ? body.idNo.trim() || undefined : undefined,
    nationality: typeof body?.nationality === 'string' ? body.nationality.trim() || undefined : undefined,
    dob: typeof body?.dob === 'string' ? body.dob.trim() || undefined : undefined,
    address: typeof body?.address === 'string' ? body.address.trim() || undefined : undefined,
    memberSince: typeof body?.memberSince === 'string' ? body.memberSince.trim() || undefined : undefined,
    lastLoginDate: typeof body?.lastLoginDate === 'string' ? body.lastLoginDate.trim() || undefined : undefined,
  };

  const updated = await updatePerson(personId, patch);
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, person: updated });
}
