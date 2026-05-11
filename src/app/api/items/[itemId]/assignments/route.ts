import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { UpdateAssignmentsRequest } from '@/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const supabase = createServerClient();
    const body: UpdateAssignmentsRequest = await request.json();

    // Validate percentages if using percentage split
    const percentageAssignments = body.assignments.filter(
      (a) => a.split_type === 'percentage'
    );

    if (percentageAssignments.length > 0) {
      const total = percentageAssignments.reduce(
        (sum, a) => sum + (a.percentage || 0),
        0
      );
      if (Math.abs(total - 100) > 0.01) {
        return NextResponse.json(
          { error: 'Percentages must sum to 100', code: 'INVALID_PERCENTAGE' },
          { status: 400 }
        );
      }
    }

    // Resolve session_id from the item so we can stamp it on each assignment
    // (required for realtime filtering by session).
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('session_id')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: 'Item not found', code: 'ITEM_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Delete existing assignments
    await supabase.from('item_assignments').delete().eq('item_id', itemId);

    // Insert new assignments
    if (body.assignments.length > 0) {
      const { error } = await supabase.from('item_assignments').insert(
        body.assignments.map((a) => ({
          item_id: itemId,
          session_id: item.session_id,
          participant_id: a.participant_id,
          split_type: a.split_type,
          percentage: a.percentage || null,
        }))
      );

      if (error) {
        return NextResponse.json(
          { error: error.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    }

    // Fetch updated assignments
    const { data } = await supabase
      .from('item_assignments')
      .select('*')
      .eq('item_id', itemId);

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
