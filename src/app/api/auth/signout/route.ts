import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase';

export async function POST(_request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient(cookieStore);
  await supabase.auth.signOut();
  // Relative Location: the browser resolves it against the URL it actually used,
  // so we never depend on the server guessing its own origin (which can resolve
  // to a host the browser can't reach, e.g. 0.0.0.0 / LAN IP / tunnel).
  // NextResponse.redirect() rejects relative URLs, so set the header directly.
  // signOut() clears the auth cookies via the cookie store, which Next attaches
  // to this response automatically.
  return new NextResponse(null, { status: 303, headers: { Location: '/login' } });
}
