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

    // Bulk path: { names: string[] }
    if (Array.isArray(body.names)) {
      const cleanNames: string[] = (body.names as unknown[])
        .filter((n): n is string => typeof n === 'string')
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      if (cleanNames.length === 0) {
        return NextResponse.json(
          { error: 'No valid names provided', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }

      const rows = cleanNames.map((name: string) => ({ session_id: sessionId, name }));
      const { data, error } = await supabase.from('participants').insert(rows).select();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'One or more participants already exist', code: 'PARTICIPANT_EXISTS' },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: error.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }

      return NextResponse.json(data, { status: 201 });
    }

    // Single path: { name: string }
    const { name } = body;

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
