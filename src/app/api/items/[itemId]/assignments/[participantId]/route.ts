import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { SplitType } from '@/types';

type Body = {
  split_type: SplitType;
  percentage?: number | null;
  unit_count?: number | null;
};

type RouteParams = { itemId: string; participantId: string };

async function loadAndAuthorize(
  supabase: ReturnType<typeof createServerClient>,
  itemId: string,
  participantId: string
) {
  const { data: item } = await supabase
    .from('items')
    .select('session_id, quantity')
    .eq('id', itemId)
    .single();

  if (!item) {
    return {
      error: NextResponse.json(
        { error: 'Item not found', code: 'ITEM_NOT_FOUND' },
        { status: 404 }
      ),
    };
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('id, session_id')
    .eq('id', participantId)
    .single();

  if (!participant || participant.session_id !== item.session_id) {
    return {
      error: NextResponse.json(
        { error: 'Participant does not belong to this session', code: 'PARTICIPANT_NOT_IN_SESSION' },
        { status: 403 }
      ),
    };
  }

  return { item };
}

function mapRpcError(message: string | undefined) {
  if (!message) return null;
  if (message.startsWith('INVALID_PERCENTAGE_SUM')) {
    return { error: 'Percentages must sum to 100', code: 'INVALID_PERCENTAGE', status: 400 };
  }
  if (message.startsWith('INVALID_UNIT_SUM')) {
    const parts = message.split(':');
    const got = parts[1];
    const expected = parts[2];
    return {
      error: `Unit counts must sum to the item's quantity (${expected}). Got ${got}.`,
      code: 'INVALID_UNIT_SUM',
      status: 400,
    };
  }
  if (message.startsWith('INVALID_UNIT_COUNT')) {
    return { error: 'unit_count must be > 0', code: 'INVALID_UNIT_COUNT', status: 400 };
  }
  if (message.startsWith('INVALID_SPLIT_TYPE')) {
    return { error: 'Invalid split_type', code: 'INVALID_SPLIT_TYPE', status: 400 };
  }
  if (message.startsWith('ITEM_NOT_FOUND')) {
    return { error: 'Item not found', code: 'ITEM_NOT_FOUND', status: 404 };
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { itemId, participantId } = await params;
    const supabase = createServerClient();
    const body = (await request.json()) as Body;

    if (!body || (body.split_type !== 'equal' && body.split_type !== 'percentage' && body.split_type !== 'unit')) {
      return NextResponse.json(
        { error: 'Invalid split_type', code: 'INVALID_SPLIT_TYPE' },
        { status: 400 }
      );
    }

    const guard = await loadAndAuthorize(supabase, itemId, participantId);
    if (guard.error) return guard.error;
    const { item } = guard;

    if (body.split_type === 'equal') {
      const { data, error } = await supabase
        .from('item_assignments')
        .upsert(
          {
            item_id: itemId,
            session_id: item.session_id,
            participant_id: participantId,
            split_type: 'equal',
            percentage: null,
            unit_count: null,
          },
          { onConflict: 'item_id,participant_id' }
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
      return NextResponse.json(data);
    }

    if (body.split_type === 'percentage') {
      if (typeof body.percentage !== 'number' || body.percentage <= 0 || body.percentage > 100) {
        return NextResponse.json(
          { error: 'percentage must be in (0, 100]', code: 'INVALID_PERCENTAGE' },
          { status: 400 }
        );
      }
    }

    if (body.split_type === 'unit') {
      if (!Number.isFinite(body.unit_count) || (body.unit_count ?? 0) <= 0) {
        return NextResponse.json(
          { error: 'unit_count must be > 0', code: 'INVALID_UNIT_COUNT' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase.rpc('upsert_assignment_validated', {
      p_item_id: itemId,
      p_participant_id: participantId,
      p_split_type: body.split_type,
      p_percentage: body.split_type === 'percentage' ? body.percentage : null,
      p_unit_count: body.split_type === 'unit' ? body.unit_count : null,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped) {
        return NextResponse.json(
          { error: mapped.error, code: mapped.code },
          { status: mapped.status }
        );
      }
      return NextResponse.json(
        { error: error.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { itemId, participantId } = await params;
    const supabase = createServerClient();

    const guard = await loadAndAuthorize(supabase, itemId, participantId);
    if (guard.error) return guard.error;

    const { error } = await supabase
      .from('item_assignments')
      .delete()
      .eq('item_id', itemId)
      .eq('participant_id', participantId);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
