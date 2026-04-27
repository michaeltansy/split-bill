import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface BulkItemInput {
  name: string;
  price: number;
  quantity?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = createServerClient();
    const body: { items: BulkItemInput[] } = await request.json();

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // Validate session exists
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Validate and prepare items
    const itemsToInsert = body.items.map((item) => {
      if (!item.name || typeof item.name !== 'string') {
        throw new Error('Each item must have a name');
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        throw new Error('Each item must have a valid price');
      }

      return {
        session_id: sessionId,
        name: item.name.trim(),
        price: item.price,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
      };
    });

    const { data, error } = await supabase
      .from('items')
      .insert(itemsToInsert)
      .select();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: 'INSERT_ERROR' },
        { status: 400 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
