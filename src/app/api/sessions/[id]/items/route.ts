import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = createServerClient();
    const body = await request.json();

    // Handle bulk insert
    if (Array.isArray(body.items)) {
      const items = body.items.map((item: any) => ({
        session_id: sessionId,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
      }));

      const { data, error } = await supabase
        .from('items')
        .insert(items)
        .select();

      if (error) {
        return NextResponse.json(
          { error: error.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }

      return NextResponse.json(data, { status: 201 });
    }

    // Single item insert
    const { data, error } = await supabase
      .from('items')
      .insert({
        session_id: sessionId,
        name: body.name,
        price: body.price,
        quantity: body.quantity || 1,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
