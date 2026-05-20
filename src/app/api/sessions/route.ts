import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, createRouteHandlerClient } from '@/lib/supabase';
import type { CreateSessionRequest } from '@/types';

const ACCOUNT_NUMBER_RE = /^[0-9]{8,20}$/;

export async function POST(request: NextRequest) {
  try {
    // Auth is enforced here in the handler — the service-role client used for
    // the write bypasses RLS, so the DB layer can't be relied on for this.
    const cookieStore = await cookies();
    const authClient = createRouteHandlerClient(cookieStore);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to create a session', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const body: CreateSessionRequest = await request.json();

    // Validate bank_account shape if present. All-or-nothing falls out of the
    // typed object — the client either sends a complete object or null/omits it.
    if (body.bank_account != null) {
      const ba = body.bank_account;
      if (
        typeof ba.bank_name !== 'string' ||
        typeof ba.bank_account_number !== 'string' ||
        typeof ba.bank_account_holder !== 'string' ||
        ba.bank_name.trim().length === 0 ||
        ba.bank_name.length > 30 ||
        !ACCOUNT_NUMBER_RE.test(ba.bank_account_number) ||
        ba.bank_account_holder.trim().length === 0 ||
        ba.bank_account_holder.length > 80
      ) {
        return NextResponse.json(
          { error: 'Invalid bank_account payload', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    }

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
        created_by: user.id,
      })
      .select()
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message ?? 'Failed to create session', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (body.bank_account) {
      const { error: bankError } = await supabase
        .from('session_bank_accounts')
        .insert({
          session_id: session.id,
          bank_name: body.bank_account.bank_name.trim(),
          bank_account_number: body.bank_account.bank_account_number,
          bank_account_holder: body.bank_account.bank_account_holder.trim(),
        });

      if (bankError) {
        // Roll back the session so we never leave an orphaned session that
        // was supposed to carry bank info.
        await supabase.from('sessions').delete().eq('id', session.id);
        return NextResponse.json(
          { error: bankError.message, code: 'INVALID_INPUT' },
          { status: 400 }
        );
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
