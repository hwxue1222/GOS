import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/admin/login', '/portal/login', '/sign', '/p'];

function loginPathFor(pathname: string) {
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/incorporation' ||
    pathname.startsWith('/incorporation/') ||
    pathname === '/corporate-secretary' ||
    pathname.startsWith('/corporate-secretary/') ||
    pathname === '/portal' ||
    pathname.startsWith('/portal/')
  ) {
    return '/portal/login';
  }
  return '/admin/login';
}

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

  const token = req.cookies.get('gos_session')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    if (pathname === '/') {
      url.pathname = isFrontDomain ? '/portal/login' : '/login';
    } else {
      url.pathname = isFrontDomain ? '/portal/login' : loginPathFor(pathname);
    }
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
