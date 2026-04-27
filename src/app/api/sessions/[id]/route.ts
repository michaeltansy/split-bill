import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

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

    return NextResponse.json({
      session,
      participants: participants || [],
      items: itemsWithAssignments,
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
