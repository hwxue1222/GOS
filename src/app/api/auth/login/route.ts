import { NextResponse } from 'next/server';
import { createSession, findUserByEmail } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim() ?? '';
  const password = body?.password ?? '';

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

  const session = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  return res;
}

