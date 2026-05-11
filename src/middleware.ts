import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ratelimit } from '@/lib/ratelimit';

export async function middleware(request: NextRequest) {
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

export const config = {
  matcher: '/api/:path*',
};
