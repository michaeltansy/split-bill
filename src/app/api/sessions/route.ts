import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, createRouteHandlerClient } from '@/lib/supabase';
import { buildSessionMoney } from '@/lib/sessionTotals';
import type { CreateSessionRequest } from '@/types';

const ACCOUNT_NUMBER_RE = /^[0-9]{8,20}$/;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

interface SessionCursor {
  createdAt: string;
  id: string;
}

function decodeCursor(raw: string): SessionCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof decoded?.createdAt === 'string' && typeof decoded?.id === 'string') {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: SessionCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

// Lists sessions created by the authenticated user, newest first. Uses keyset
// (cursor) pagination on (created_at, id) rather than offset/page-number —
// stable under concurrent inserts and doesn't degrade as the offset grows.
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createRouteHandlerClient(cookieStore);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to view session history', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    const cursorParam = searchParams.get('cursor');
    let cursor: SessionCursor | null = null;
    if (cursorParam) {
      cursor = decodeCursor(cursorParam);
      if (!cursor) {
        return NextResponse.json(
          { error: 'Invalid cursor', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    }

    const supabase = createServerClient();
    let query = supabase
      .from('sessions')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message, code: 'INVALID_INPUT' }, { status: 400 });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const sessions = hasMore ? rows.slice(0, limit) : rows;
    const last = sessions[sessions.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    return NextResponse.json({ sessions, nextCursor });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth is enforced here in the handler — the service-role client used for
    // the write bypasses RLS, so the DB layer can't be relied on for this.
    const cookieStore = await cookies();
    const authClient = createRouteHandlerClient(cookieStore);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to create a session', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const body: CreateSessionRequest = await request.json();

    // Validate bank_account shape if present. All-or-nothing falls out of the
    // typed object — the client either sends a complete object or null/omits it.
    if (body.bank_account != null) {
      const ba = body.bank_account;
      if (
        typeof ba.bank_name !== 'string' ||
        typeof ba.bank_account_number !== 'string' ||
        typeof ba.bank_account_holder !== 'string' ||
        ba.bank_name.trim().length === 0 ||
        ba.bank_name.length > 30 ||
        !ACCOUNT_NUMBER_RE.test(ba.bank_account_number) ||
        ba.bank_account_holder.trim().length === 0 ||
        ba.bank_account_holder.length > 80
      ) {
        return NextResponse.json(
          { error: 'Invalid bank_account payload', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    }

    // Derived totals (discount amount, grand total, percentages) are always
    // computed here; any the client sends are ignored.
    const money = buildSessionMoney(body);
    if (!money.ok) {
      return NextResponse.json({ error: money.error, code: money.code }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        ...money.values,
        receipt_image_url: body.receipt_image_url || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message ?? 'Failed to create session', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (body.bank_account) {
      const { error: bankError } = await supabase
        .from('session_bank_accounts')
        .insert({
          session_id: session.id,
          bank_name: body.bank_account.bank_name.trim(),
          bank_account_number: body.bank_account.bank_account_number,
          bank_account_holder: body.bank_account.bank_account_holder.trim(),
        });

      if (bankError) {
        // Roll back the session so we never leave an orphaned session that
        // was supposed to carry bank info.
        await supabase.from('sessions').delete().eq('id', session.id);
        return NextResponse.json(
          { error: bankError.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
