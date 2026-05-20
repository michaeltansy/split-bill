import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, createRouteHandlerClient } from '@/lib/supabase';

// Fields on a session that only its owner may change. Everything else stays open
// (the existing anonymous edit model for totals etc. is unchanged).
const OWNER_GATED_FIELDS = ['status', 'deleted_at'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError || !session || session.deleted_at) {
      // Soft-deleted sessions are treated as not found for everyone (until restored).
      return NextResponse.json(
        { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Session has expired', code: 'SESSION_EXPIRED' },
        { status: 410 }
      );
    }

    // Fetch participants
    const { data: participants } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', id);

    // Fetch items with assignments
    const { data: items } = await supabase
      .from('items')
      .select('*')
      .eq('session_id', id);

    const itemIds = (items || []).map((i) => i.id);
    let assignments: any[] = [];

    if (itemIds.length > 0) {
      const { data } = await supabase
        .from('item_assignments')
        .select('*')
        .in('item_id', itemIds);
      assignments = data || [];
    }

    const itemsWithAssignments = (items || []).map((item) => ({
      ...item,
      assignments: assignments.filter((a) => a.item_id === item.id),
    }));

    // v1: at most one bank account per session. Future multi-bank lifts the UNIQUE
    // constraint and switches this to an array; rendering callers go through
    // BankInfoCard only.
    const { data: bankAccount } = await supabase
      .from('session_bank_accounts')
      .select('*')
      .eq('session_id', id)
      .maybeSingle();

    return NextResponse.json({
      session,
      participants: participants || [],
      items: itemsWithAssignments,
      bank_account: bankAccount ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const body = await request.json();

    const touchesOwnerFields = OWNER_GATED_FIELDS.some((f) => f in body);

    if (touchesOwnerFields) {
      // Only `null` (restore) is accepted for deleted_at — deletion must go through
      // the confirm-guarded DELETE verb, never a bare PATCH.
      if ('deleted_at' in body && body.deleted_at !== null) {
        return NextResponse.json(
          { error: 'deleted_at can only be cleared (set to null)', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }

      const cookieStore = await cookies();
      const authClient = createRouteHandlerClient(cookieStore);
      const {
        data: { user },
      } = await authClient.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: 'Sign in to manage this session', code: 'UNAUTHENTICATED' },
          { status: 401 }
        );
      }

      const { data, error } = await supabase
        .from('sessions')
        .update(body)
        .eq('id', id)
        .eq('created_by', user.id)
        .select();

      if (error) {
        return NextResponse.json(
          { error: error.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
      if (!data || data.length === 0) {
        // Not the owner, or no such session — reveal nothing about which.
        return NextResponse.json(
          { error: 'Not allowed to modify this session', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }

      return NextResponse.json(data[0]);
    }

    // Open path: non-owner-gated fields (totals etc.), unchanged behavior.
    const { data, error } = await supabase
      .from('sessions')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// Soft-delete: owner-scoped. Sets deleted_at instead of removing the row, so the
// list's Undo can restore it. The created_by filter is in the same statement, so a
// non-owner can never delete another user's (or an anonymous) session.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const authClient = createRouteHandlerClient(cookieStore);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to delete this session', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('created_by', user.id)
      .is('deleted_at', null)
      .select('id');

    if (error) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }
    if (!data || data.length === 0) {
      // Not found, not owned, or already deleted — indistinguishable on purpose.
      return NextResponse.json(
        { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({ id }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
