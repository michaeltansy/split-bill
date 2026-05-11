import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { CreateSessionRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body: CreateSessionRequest = await request.json();

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

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
