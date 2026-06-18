'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  Session,
  SessionBankAccount,
  Participant,
  ItemWithAssignments,
  Item,
  ItemAssignment,
  UpdateAssignmentsRequest,
  SplitType,
} from '@/types';

interface UseSessionReturn {
  session: Session | null;
  participants: Participant[];
  items: ItemWithAssignments[];
  bankAccount: SessionBankAccount | null;
  isLoading: boolean;
  error: Error | null;
  updateSession: (data: Partial<Session>) => Promise<void>;
  addParticipants: (names: string[]) => Promise<Participant[]>;
  removeParticipant: (id: string) => Promise<void>;
  addItem: (item: Omit<Item, 'id' | 'session_id' | 'created_at'>) => Promise<Item>;
  updateItem: (id: string, data: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateAssignments: (itemId: string, assignments: UpdateAssignmentsRequest) => Promise<void>;
  claimItem: (itemId: string, participantId: string) => Promise<void>;
  unclaimItem: (itemId: string, participantId: string) => Promise<void>;
  setShare: (
    itemId: string,
    participantId: string,
    split_type: 'percentage' | 'unit',
    value: { percentage?: number; unit_count?: number }
  ) => Promise<void>;
  markPaid: (participantId: string, paid: boolean) => Promise<void>;
  applyAssignmentLocally: (row: ItemAssignment) => void;
  removeAssignmentLocally: (itemId: string, participantId: string) => void;
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res;
}

// Idempotent merge keyed on (item_id, participant_id). The optimistic row and
// the realtime echo share the same key, so the echo cleanly replaces the
// optimistic placeholder without producing duplicates.
function mergeAssignment(
  items: ItemWithAssignments[],
  row: ItemAssignment
): ItemWithAssignments[] {
  return items.map((item) => {
    if (item.id !== row.item_id) return item;
    const idx = item.assignments.findIndex((a) => a.participant_id === row.participant_id);
    if (idx === -1) {
      return { ...item, assignments: [...item.assignments, row] };
    }
    const next = [...item.assignments];
    next[idx] = row;
    return { ...item, assignments: next };
  });
}

export function useSession(sessionId: string): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<ItemWithAssignments[]>([]);
  const [bankAccount, setBankAccount] = useState<SessionBankAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await apiFetch(`/api/sessions/${sessionId}`);
      const { session, participants, items, bank_account } = await res.json();

      setSession(session);
      setParticipants(participants ?? []);
      setItems(items ?? []);
      setBankAccount(bank_account ?? null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch session'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Granular realtime: each handler surgically patches local state. Avoids the
  // full-session refetch that previously made every claim look like a reload.
  // The subscription waits until the initial fetch has settled so early echoes
  // can't merge into empty state and then get overwritten by the initial GET.
  useEffect(() => {
    if (isLoading) return;

    const channel = supabase.channel(`session:${sessionId}`);

    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = payload.new as Session;
          setSession((curr) => (curr ? { ...curr, ...next } : next));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Participant;
          setParticipants((curr) => (curr.some((p) => p.id === row.id) ? curr : [...curr, row]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Participant;
          setParticipants((curr) => curr.map((p) => (p.id === row.id ? { ...p, ...row } : p)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const old = payload.old as Partial<Participant>;
          if (!old.id) return;
          setParticipants((curr) => curr.filter((p) => p.id !== old.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Item;
          setItems((curr) =>
            curr.some((i) => i.id === row.id) ? curr : [...curr, { ...row, assignments: [] }]
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Item;
          setItems((curr) =>
            curr.map((i) => (i.id === row.id ? { ...i, ...row, assignments: i.assignments } : i))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const old = payload.old as Partial<Item>;
          if (!old.id) return;
          setItems((curr) => curr.filter((i) => i.id !== old.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'item_assignments', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setItems((curr) => mergeAssignment(curr, payload.new as ItemAssignment));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'item_assignments', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setItems((curr) => mergeAssignment(curr, payload.new as ItemAssignment));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'item_assignments', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const old = payload.old as Partial<ItemAssignment>;
          if (!old.item_id || !old.participant_id) return;
          setItems((curr) =>
            curr.map((item) =>
              item.id === old.item_id
                ? {
                    ...item,
                    assignments: item.assignments.filter(
                      (a) => a.participant_id !== old.participant_id
                    ),
                  }
                : item
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isLoading]);

  const updateSession = async (data: Partial<Session>) => {
    await apiFetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  };

  const addParticipants = async (names: string[]): Promise<Participant[]> => {
    const res = await apiFetch(`/api/sessions/${sessionId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ names }),
    });
    return res.json();
  };

  const removeParticipant = async (id: string) => {
    await apiFetch(`/api/sessions/${sessionId}/participants/${id}`, {
      method: 'DELETE',
    });
  };

  const addItem = async (
    item: Omit<Item, 'id' | 'session_id' | 'created_at'>
  ): Promise<Item> => {
    const res = await apiFetch(`/api/sessions/${sessionId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
    return res.json();
  };

  const updateItem = async (id: string, data: Partial<Item>) => {
    await apiFetch(`/api/sessions/${sessionId}/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  };

  const deleteItem = async (id: string) => {
    await apiFetch(`/api/sessions/${sessionId}/items/${id}`, {
      method: 'DELETE',
    });
  };

  const updateAssignments = async (
    itemId: string,
    request: UpdateAssignmentsRequest
  ) => {
    await apiFetch(`/api/items/${itemId}/assignments`, {
      method: 'PUT',
      body: JSON.stringify(request),
    });
  };

  const claimItem = useCallback(async (itemId: string, participantId: string) => {
    await apiFetch(`/api/items/${itemId}/assignments/${participantId}`, {
      method: 'POST',
      body: JSON.stringify({ split_type: 'equal' as SplitType }),
    });
  }, []);

  const unclaimItem = useCallback(async (itemId: string, participantId: string) => {
    await apiFetch(`/api/items/${itemId}/assignments/${participantId}`, {
      method: 'DELETE',
    });
  }, []);

  const setShare = useCallback(
    async (
      itemId: string,
      participantId: string,
      split_type: 'percentage' | 'unit',
      value: { percentage?: number; unit_count?: number }
    ) => {
      await apiFetch(`/api/items/${itemId}/assignments/${participantId}`, {
        method: 'POST',
        body: JSON.stringify({ split_type, ...value }),
      });
    },
    []
  );

  const markPaid = useCallback(
    async (participantId: string, paid: boolean) => {
      // Capture prior state synchronously so the rollback is always available,
      // even when instant mocks (tests) resolve the fetch before React flushes.
      const prior = participants.find((p) => p.id === participantId);
      setParticipants((curr) =>
        curr.map((p) =>
          p.id !== participantId
            ? p
            : { ...p, is_paid: paid, paid_at: paid ? new Date().toISOString() : null }
        )
      );

      try {
        await apiFetch(`/api/sessions/${sessionId}/participants/${participantId}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_paid: paid }),
        });
      } catch (e) {
        if (prior) {
          setParticipants((curr) => curr.map((p) => (p.id === participantId ? prior! : p)));
        }
        throw e;
      }
    },
    [sessionId, participants]
  );

  const applyAssignmentLocally = useCallback((row: ItemAssignment) => {
    setItems((curr) => mergeAssignment(curr, row));
  }, []);

  const removeAssignmentLocally = useCallback(
    (itemId: string, participantId: string) => {
      setItems((curr) =>
        curr.map((item) =>
          item.id === itemId
            ? {
                ...item,
                assignments: item.assignments.filter((a) => a.participant_id !== participantId),
              }
            : item
        )
      );
    },
    []
  );

  return {
    session,
    participants,
    items,
    bankAccount,
    isLoading,
    error,
    updateSession,
    addParticipants,
    removeParticipant,
    addItem,
    updateItem,
    deleteItem,
    updateAssignments,
    claimItem,
    unclaimItem,
    setShare,
    markPaid,
    applyAssignmentLocally,
    removeAssignmentLocally,
  };
}
