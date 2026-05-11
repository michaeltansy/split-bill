'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  Session,
  Participant,
  ItemWithAssignments,
  Item,
  UpdateAssignmentsRequest,
} from '@/types';

interface UseSessionReturn {
  session: Session | null;
  participants: Participant[];
  items: ItemWithAssignments[];
  isLoading: boolean;
  error: Error | null;
  updateSession: (data: Partial<Session>) => Promise<void>;
  addParticipants: (names: string[]) => Promise<Participant[]>;
  removeParticipant: (id: string) => Promise<void>;
  addItem: (item: Omit<Item, 'id' | 'session_id' | 'created_at'>) => Promise<Item>;
  updateItem: (id: string, data: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateAssignments: (itemId: string, assignments: UpdateAssignmentsRequest) => Promise<void>;
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

export function useSession(sessionId: string): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<ItemWithAssignments[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await apiFetch(`/api/sessions/${sessionId}`);
      const { session, participants, items } = await res.json();

      setSession(session);
      setParticipants(participants ?? []);
      setItems(items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch session'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Real-time subscriptions — still use the supabase client to listen for
  // postgres changes, but re-fetch through the API on each event.
  useEffect(() => {
    const channel = supabase.channel(`session:${sessionId}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        () => { fetchSession(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        () => { fetchSession(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
        () => { fetchSession(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_assignments', filter: `session_id=eq.${sessionId}` },
        () => { fetchSession(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchSession]);

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

  return {
    session,
    participants,
    items,
    isLoading,
    error,
    updateSession,
    addParticipants,
    removeParticipant,
    addItem,
    updateItem,
    deleteItem,
    updateAssignments,
  };
}
