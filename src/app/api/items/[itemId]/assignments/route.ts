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

    // Resolve session_id + quantity from the item so we can stamp session_id on every
    // assignment row (for realtime filtering) and validate unit splits against the
    // item's actual quantity.
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('session_id, quantity')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: 'Item not found', code: 'ITEM_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Percentage split: assignments tagged 'percentage' must sum to 100
    const percentageAssignments = body.assignments.filter((a) => a.split_type === 'percentage');
    if (percentageAssignments.length > 0) {
      const total = percentageAssignments.reduce((sum, a) => sum + (a.percentage || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        return NextResponse.json(
          { error: 'Percentages must sum to 100', code: 'INVALID_PERCENTAGE' },
          { status: 400 }
        );
      }
    }

    // Unit split: assignments tagged 'unit' must each have unit_count > 0
    // AND their sum must equal the item's quantity.
    const unitAssignments = body.assignments.filter((a) => a.split_type === 'unit');
    if (unitAssignments.length > 0) {
      const badUnits = unitAssignments.find(
        (a) => !Number.isFinite(a.unit_count) || (a.unit_count ?? 0) <= 0
      );
      if (badUnits) {
        return NextResponse.json(
          { error: 'Each unit split assignment needs unit_count > 0', code: 'INVALID_UNIT_COUNT' },
          { status: 400 }
        );
      }
      const totalUnits = unitAssignments.reduce((sum, a) => sum + (a.unit_count || 0), 0);
      if (totalUnits !== item.quantity) {
        return NextResponse.json(
          {
            error: `Unit counts must sum to the item's quantity (${item.quantity}). Got ${totalUnits}.`,
            code: 'INVALID_UNIT_SUM',
          },
          { status: 400 }
        );
      }
    }

    // Delete existing assignments
    await supabase.from('item_assignments').delete().eq('item_id', itemId);

    // Insert new assignments
    if (body.assignments.length > 0) {
      const rows = body.assignments.map((a) => ({
        item_id: itemId,
        session_id: item.session_id,
        participant_id: a.participant_id,
        split_type: a.split_type,
        percentage: a.split_type === 'percentage' ? a.percentage ?? null : null,
        unit_count: a.split_type === 'unit' ? a.unit_count ?? null : null,
      }));

      const { error } = await supabase.from('item_assignments').insert(rows);
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
