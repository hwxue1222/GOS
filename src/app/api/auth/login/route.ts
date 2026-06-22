import { NextResponse } from 'next/server';
import {
  createPortalSession,
  createSession,
  findPortalUserByEmail,
  findUserByEmailOrName,
  touchPersonLastLoginDateByEmail,
  touchPersonLastLoginDateByPortalUserId,
} from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { ADMIN_SESSION_COOKIE, PORTAL_SESSION_COOKIE } from '@/lib/auth';

function isHttpsRequest(req: Request) {
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')).split(',')[0]!.trim();
  return proto === 'https';
}

function clearCookie(res: NextResponse, name: string, req: Request) {
  res.cookies.set(name, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    expires: new Date(0),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: string; account?: string; password?: string; mode?: string }
      | null;
    const account = (body?.account ?? body?.email ?? '').trim();
    const password = body?.password ?? '';
    const mode = String(body?.mode ?? '').trim();

    if (!account || !password) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }

    if (mode === 'portal') {
      const user = await findPortalUserByEmail(account);
      if (!user) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

      const session = await createPortalSession(user.id);
      await touchPersonLastLoginDateByPortalUserId(user.id).catch(() => null);
      await touchPersonLastLoginDateByEmail(user.email).catch(() => null);

      const res = NextResponse.json({ ok: true, role: 'client' });
      res.cookies.set(PORTAL_SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isHttpsRequest(req),
        path: '/',
      });
      clearCookie(res, ADMIN_SESSION_COOKIE, req);
      return res;
    }

    const user = await findUserByEmailOrName(account);
    if (!user) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ ok: false, error: 'INVALID_LOGIN' }, { status: 401 });

    const session = await createSession(user.id);

    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(ADMIN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttpsRequest(req),
      path: '/',
    });
    clearCookie(res, PORTAL_SESSION_COOKIE, req);
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 });
  }
}
