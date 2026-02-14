import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — Server-side route protection.
 *
 * - `/dashboard/**` requires an `accessToken` cookie; redirects to `/login` if missing.
 * - `/login` and `/register` redirect to `/dashboard` when already authenticated.
 *
 * This is a first-pass guard. The client-side DashboardLayout still validates
 * the token against the backend (`/auth/profile`) and handles refresh/expiry.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('accessToken')?.value;

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
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
