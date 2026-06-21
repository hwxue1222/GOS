import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/db';
import type { Permissions } from '@/lib/types';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const canViewAll = hasPermission(user, 'staffs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'staffs', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const users = await listUsers();
  const visible = canViewAll ? users : users.filter((u) => u.id === user.id);
  return NextResponse.json({
    ok: true,
    users: visible.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      position: u.position,
      role: u.role,
      permissions: u.permissions,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'staffs', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        name?: string;
        email?: string;
        position?: string;
        role?: 'owner' | 'manager' | 'staff';
        permissions?: Permissions;
        password?: string;
      }
    | null;
  const name = body?.name?.trim() ?? '';
  const email = body?.email?.trim() ?? '';
  const position = body?.position?.trim() || undefined;
  const requestedRole = body?.role ?? 'staff';
  if (requestedRole === 'owner') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (requestedRole !== 'staff' && user.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const role = requestedRole;
  const permissions = body?.permissions;
  const password = body?.password ? body.password : '123456';

  if (!name || !email) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const result = await createUser({ name, email, position, role, permissions, password });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({
    ok: true,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      position: result.user.position,
      role: result.user.role,
      permissions: result.user.permissions,
    },
  });
}
