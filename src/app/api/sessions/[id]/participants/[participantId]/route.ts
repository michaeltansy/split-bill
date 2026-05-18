import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { participantId } = await params;
    const supabase = createServerClient();
    const body = await request.json().catch(() => ({}));

    if (typeof body.is_paid !== 'boolean') {
      return NextResponse.json(
        { error: 'is_paid (boolean) is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('participants')
      .update({
        is_paid: body.is_paid,
        // Server-stamp so client clock skew can't lie about when payment was marked.
        paid_at: body.is_paid ? new Date().toISOString() : null,
      })
      .eq('id', participantId)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { participantId } = await params;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('id', participantId);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
