import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildSessionMoney } from '@/lib/sessionTotals';

// Fields a client may change. Everything else (grand_total, percentages,
// discount_amount, created_by, expires_at, ...) is dropped or derived here.
const MONEY_FIELDS = [
  'subtotal',
  'tax_amount',
  'service_amount',
  'discount_type',
  'discount_value',
] as const;
const EDITABLE_FIELDS = [...MONEY_FIELDS, 'status'] as const;

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

    if (sessionError || !session) {
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

    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body && Object.prototype.hasOwnProperty.call(body, field)) {
        patch[field] = body[field];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields provided', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    let update: Record<string, unknown> = patch;

    if (MONEY_FIELDS.some((field) => field in patch)) {
      // Merge over the stored row so derived totals always reflect the full
      // set of money inputs, not just the ones in this request.
      const { data: current, error: currentError } = await supabase
        .from('sessions')
        .select('subtotal, tax_amount, service_amount, discount_type, discount_value')
        .eq('id', id)
        .single();

      if (currentError || !current) {
        return NextResponse.json(
          { error: 'Session not found', code: 'SESSION_NOT_FOUND' },
          { status: 404 }
        );
      }

      const money = buildSessionMoney({ ...current, ...patch });
      if (!money.ok) {
        return NextResponse.json({ error: money.error, code: money.code }, { status: 400 });
      }

      update = { ...patch, ...money.values };
    }

    const { data, error } = await supabase
      .from('sessions')
      .update(update)
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
