import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_SESSION_COOKIE = 'gos_session';
const PORTAL_SESSION_COOKIE = 'gos_portal_session';

const publicPaths = ['/login', '/admin/login', '/portal/login', '/portal/forgot-password', '/sign', '/p'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const rawHost = String(req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase();
  const firstHost = rawHost.split(',')[0]?.trim() ?? '';
  const hostNoPort = firstHost.replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0]?.trim() ?? '';
  const isFrontDomain = hostNoPort === 'bby.today' || hostNoPort === 'www.bby.today' || hostNoPort.endsWith('.bby.today');

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/contracts/') && /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  const token = isFrontDomain ? req.cookies.get(PORTAL_SESSION_COOKIE)?.value : req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = isFrontDomain ? '/portal/login' : '/admin/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
