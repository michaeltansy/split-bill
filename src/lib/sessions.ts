import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListSessionsResponse, SessionSummary, SessionTab } from '@/types';

const PAGE_SIZE = 10;

// Shared owner-scoped list query, used by both the /sessions RSC (no self-fetch)
// and GET /api/sessions (tab switches + "Load more"). Always filters by the
// caller's id — never trusts a client-supplied owner.
//
// Tabs:
//   active  = not yet expired AND status 'active'
//   expired = past expiry OR status in ('expired','completed')  (closed folds in here)
export async function listSessionsForUser(
  client: SupabaseClient,
  userId: string,
  tab: SessionTab,
  cursor: string | null
): Promise<ListSessionsResponse> {
  const nowIso = new Date().toISOString();

  let query = client
    .from('sessions')
    .select('id, created_at, expires_at, grand_total, status, participants(count)')
    .eq('created_by', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    // Fetch one extra row as a cheap "has more" probe.
    .limit(PAGE_SIZE + 1);

  if (tab === 'active') {
    query = query.gte('expires_at', nowIso).eq('status', 'active');
  } else {
    query = query.or(`expires_at.lt.${nowIso},status.in.(expired,completed)`);
  }

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);

  const sessions: SessionSummary[] = page.map((row) => {
    // PostgREST returns the aggregate as participants: [{ count: N }].
    const agg = row.participants as unknown as Array<{ count: number }> | null;
    return {
      id: row.id,
      created_at: row.created_at,
      expires_at: row.expires_at,
      grand_total: row.grand_total,
      status: row.status,
      participant_count: agg?.[0]?.count ?? 0,
    };
  });

  return {
    sessions,
    next_cursor: hasMore ? page[page.length - 1].created_at : null,
  };
}
