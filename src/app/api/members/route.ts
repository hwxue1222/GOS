import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, createPerson, listPersons } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'people', 'viewAll') && !hasPermission(user, 'people', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const people = await listPersons();
  return NextResponse.json({ ok: true, members: people });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'people', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

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

  const fullName = body?.fullName?.trim() ?? '';
  if (!fullName) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const member = await createPerson({
    fullName,
    email: body?.email?.trim() || undefined,
    phone: body?.phone?.trim() || undefined,
    idType: body?.idType,
    idNo: body?.idNo?.trim() || undefined,
    nationality: body?.nationality?.trim() || undefined,
    dob: body?.dob?.trim() || undefined,
    address: body?.address?.trim() || undefined,
    memberSince: body?.memberSince?.trim() || undefined,
    lastLoginDate: body?.lastLoginDate?.trim() || undefined,
  });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'members',
    action: 'create',
    entityType: 'person',
    entityId: member.id,
    summary: `Create member: ${member.fullName}`,
  });
  return NextResponse.json({ ok: true, member });
}
