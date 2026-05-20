import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ratelimit } from '@/lib/ratelimit';
import { createMiddlewareClient } from '@/lib/supabase';

// Page routes that require an authenticated user. Participant/share flows and
// the API stay open (API is gated per-handler where needed).
const PROTECTED_PAGES = ['/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit API traffic (unchanged behavior, now scoped here since the
  // matcher also covers page routes for auth-session refresh).
  if (pathname.startsWith('/api/')) {
    if (!ratelimit) return NextResponse.next();

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      '127.0.0.1';

    const { success, limit, remaining, reset } = await ratelimit.limit(ip);

    const headers = {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(reset),
    };

    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
          },
        }
      );
    }

    const response = NextResponse.next();
    Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  // Page routes: refresh the auth session (token rotation) and gate protected pages.
  const response = NextResponse.next({ request });
  const supabase = createMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && PROTECTED_PAGES.includes(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?redirect=${encodeURIComponent(pathname)}`;
    const redirectResponse = NextResponse.redirect(loginUrl);
    // Preserve any rotated auth cookies set during getUser().
    response.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  return response;
}

export const config = {
  // Run on API routes (rate limit) and page routes (auth refresh + gating),
  // excluding Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|banks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
