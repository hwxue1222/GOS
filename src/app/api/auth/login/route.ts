import { NextResponse } from 'next/server';
import { createSession, findUserByEmailOrName } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { SESSION_COOKIE } from '@/lib/auth';

function isHttpsRequest(req: Request) {
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')).split(',')[0]!.trim();
  return proto === 'https';
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: string; account?: string; password?: string }
      | null;
    const account = (body?.account ?? body?.email ?? '').trim();
    const password = body?.password ?? '';

    if (!account || !password) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }

    const user = await findUserByEmailOrName(account);
    if (!user) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

    const session = await createSession(user.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttpsRequest(req),
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 });
  }
}
