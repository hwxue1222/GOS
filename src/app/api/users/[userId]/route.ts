import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findUserByEmail, updateUser } from '@/lib/db';
import type { Permissions, Role } from '@/lib/types';
import { hasPermission } from '@/lib/permissions';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(me, 'staffs', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { name?: string; email?: string; position?: string; role?: Role; permissions?: Permissions }
    | null;

  const patch: { name?: string; email?: string; position?: string; role?: Role; permissions?: Permissions } =
    {};
  if (typeof body?.name === 'string') patch.name = body.name.trim();
  if (typeof body?.email === 'string') patch.email = body.email.trim();
  if (typeof body?.position === 'string') patch.position = body.position.trim() || undefined;
  if (body?.role) patch.role = body.role;
  if (body?.permissions) patch.permissions = body.permissions;

  if (patch.email === '' || patch.name === '') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  if (patch.email) {
    const hit = await findUserByEmail(patch.email);
    if (hit && hit.id !== userId) {
      return NextResponse.json({ ok: false, error: 'EMAIL_TAKEN' }, { status: 409 });
    }
  }
  const updated = await updateUser(userId, patch);
  if (!updated.ok) {
    const status = updated.error === 'NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ ok: false, error: updated.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      position: updated.user.position,
      role: updated.user.role,
      permissions: updated.user.permissions,
    },
  });
}
