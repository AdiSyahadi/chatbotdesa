import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — Server-side route protection.
 *
 * - `/dashboard/admin/**` requires an `accessToken` cookie; redirects to `/admin/login` if missing.
 * - `/dashboard/**` (non-admin) requires an `accessToken` cookie; redirects to `/login` if missing.
 * - `/login` and `/register` redirect to `/dashboard` when already authenticated.
 * - `/admin/login` is always publicly accessible (client-side handles already-authed redirect).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('accessToken')?.value;

  // Admin routes — require auth, redirect to dedicated admin login
  if (pathname.startsWith('/dashboard/admin')) {
    if (!accessToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes — require auth
  if (pathname.startsWith('/dashboard')) {
    if (!accessToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Auth pages — redirect away if already authenticated
  if (pathname === '/login' || pathname === '/register') {
    if (accessToken) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/admin/:path*'],
};
