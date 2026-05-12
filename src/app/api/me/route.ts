import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findUserByEmail, findUserById, setUserPassword, updateUser } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, user });
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { name?: string; email?: string; currentPassword?: string; newPassword?: string }
    | null;

  const patch: { name?: string; email?: string } = {};
  if (typeof body?.name === 'string') patch.name = body.name.trim();
  if (typeof body?.email === 'string') patch.email = body.email.trim();

  if (patch.name === '' || patch.email === '') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const wantsPassword = typeof body?.newPassword === 'string' && body.newPassword.length > 0;
  if (!wantsPassword && !patch.name && !patch.email) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  if (patch.email) {
    const hit = await findUserByEmail(patch.email);
    if (hit && hit.id !== me.id) return NextResponse.json({ ok: false, error: 'EMAIL_TAKEN' }, { status: 409 });
  }

  const full = await findUserById(me.id);
  if (!full) return NextResponse.json({ ok: false }, { status: 401 });

  if (wantsPassword) {
    const currentPassword = body?.currentPassword ?? '';
    const newPassword = body?.newPassword ?? '';
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }
    const ok = await verifyPassword(currentPassword, full.passwordHash);
    if (!ok) return NextResponse.json({ ok: false, error: 'INVALID_PASSWORD' }, { status: 400 });
  }

  let updatedUser = full;
  if (patch.name || patch.email) {
    const u = await updateUser(me.id, patch);
    if (!u.ok) return NextResponse.json({ ok: false, error: u.error }, { status: 409 });
    updatedUser = u.user;
  }
  if (wantsPassword) {
    const u = await setUserPassword(me.id, body!.newPassword!);
    if (!u) return NextResponse.json({ ok: false }, { status: 401 });
    updatedUser = u;
  }

  return NextResponse.json({
    ok: true,
    user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, permissions: updatedUser.permissions },
  });
}
