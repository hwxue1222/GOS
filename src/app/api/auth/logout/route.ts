import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/auth';

function isHttpsRequest(req: Request) {
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')).split(',')[0]!.trim();
  return proto === 'https';
}

export async function POST(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    expires: new Date(0),
  });
  return res;
}
