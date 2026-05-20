import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase';
import { safeRedirect } from '@/lib/safeRedirect';

// OAuth callback: Google redirects here with a code. Exchange it for a session
// (sets auth cookies via the route-handler client) then bounce to the
// sanitized destination.
//
// Redirects use a relative Location header so the browser resolves them against
// the URL it actually used — we never depend on the server guessing its own
// origin (which can resolve to a host the browser can't reach). dest is already
// a same-origin relative path (safeRedirect guarantees it). NextResponse.redirect()
// rejects relative URLs, so set the header directly.
function relativeRedirect(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const dest = safeRedirect(searchParams.get('redirect'));

  if (!code) {
    return relativeRedirect('/login?error=oauth');
  }

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return relativeRedirect('/login?error=oauth');
  }

  return relativeRedirect(dest);
}
