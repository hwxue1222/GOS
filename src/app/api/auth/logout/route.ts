import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deletePortalSession, deleteSession } from '@/lib/db';
import { ADMIN_SESSION_COOKIE, PORTAL_SESSION_COOKIE } from '@/lib/auth';

function isHttpsRequest(req: Request) {
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')).split(',')[0]!.trim();
  return proto === 'https';
}

export async function POST(req: Request) {
  const jar = await cookies();
  const adminToken = jar.get(ADMIN_SESSION_COOKIE)?.value;
  const portalToken = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (adminToken) await deleteSession(adminToken);
  if (portalToken) await deletePortalSession(portalToken);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    expires: new Date(0),
  });
  res.cookies.set(PORTAL_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    expires: new Date(0),
  });
  return res;
}
