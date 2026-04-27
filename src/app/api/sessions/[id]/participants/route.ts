import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = createServerClient();
    const { name } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('participants')
      .insert({ session_id: sessionId, name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Participant already exists', code: 'PARTICIPANT_EXISTS' },
          { status: 409 }
        );
      }
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
