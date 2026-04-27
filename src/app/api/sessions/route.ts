import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { CreateSessionRequest, OCRItem } from '@/types';

interface CreateSessionWithItems extends CreateSessionRequest {
  items?: OCRItem[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body: CreateSessionWithItems = await request.json();

    // Create the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        subtotal: body.subtotal || 0,
        tax_amount: body.tax_amount || 0,
        service_amount: body.service_amount || 0,
        grand_total: body.grand_total || 0,
        tax_percentage: body.tax_percentage || 0,
        service_percentage: body.service_percentage || 0,
        receipt_image_url: body.receipt_image_url || null,
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // If items were provided from OCR, create them
    if (body.items && body.items.length > 0) {
      const itemsToInsert = body.items.map((item) => ({
        session_id: session.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
      }));

      const { error: itemsError } = await supabase
        .from('items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Failed to create items:', itemsError);
        // Continue anyway - session was created successfully
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
