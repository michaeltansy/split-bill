import { createClient } from '@supabase/supabase-js';
import { createBrowserClient, createServerClient as createSSRClient } from '@supabase/ssr';
import type { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser singleton (client components). Cookie-aware via @supabase/ssr so it
// shares the auth session with server components, route handlers, and middleware.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Service-role client for trusted server writes that intentionally bypass RLS.
// Auth must be enforced in the route handler (verify auth.uid()) before using this.
export function createServerClient() {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// Cookie-bound client for React Server Components / pages. Read-only on cookies:
// RSCs can't set cookies, so writes are no-ops here (middleware handles refresh).
export function createServerComponentClient(cookieStore: CookieStore) {
  return createSSRClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op: RSCs cannot mutate cookies. Session refresh happens in middleware.
      },
    },
  });
}

// Cookie-bound client for Route Handlers — can both read and write auth cookies.
export function createRouteHandlerClient(cookieStore: CookieStore) {
  return createSSRClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });
}

// Cookie-bound client for middleware — refreshes the session and writes rotated
// auth cookies onto the outgoing response.
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createSSRClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
