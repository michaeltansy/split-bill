'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  Session,
  Participant,
  ItemWithAssignments,
  Item,
  ItemAssignment,
  UpdateAssignmentsRequest,
} from '@/types';

interface UseSessionReturn {
  session: Session | null;
  participants: Participant[];
  items: ItemWithAssignments[];
  isLoading: boolean;
  error: Error | null;
  updateSession: (data: Partial<Session>) => Promise<void>;
  addParticipant: (name: string) => Promise<Participant>;
  removeParticipant: (id: string) => Promise<void>;
  addItem: (item: Omit<Item, 'id' | 'session_id' | 'created_at'>) => Promise<Item>;
  updateItem: (id: string, data: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateAssignments: (itemId: string, assignments: UpdateAssignmentsRequest) => Promise<void>;
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

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      const { data: participantsData, error: participantsError } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId);

      if (participantsError) throw participantsError;
      setParticipants(participantsData || []);

      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .eq('session_id', sessionId);

      if (itemsError) throw itemsError;

      const itemIds = (itemsData || []).map((i) => i.id);
      let assignmentsData: ItemAssignment[] = [];

      if (itemIds.length > 0) {
        const { data, error: assignmentsError } = await supabase
          .from('item_assignments')
          .select('*')
          .in('item_id', itemIds);

        if (assignmentsError) throw assignmentsError;
        assignmentsData = data || [];
      }

      const itemsWithAssignments: ItemWithAssignments[] = (itemsData || []).map((item) => ({
        ...item,
        assignments: assignmentsData.filter((a) => a.item_id === item.id),
      }));

      setItems(itemsWithAssignments);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch session'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Set up real-time subscriptions
  useEffect(() => {
    const channel = supabase.channel(`session:${sessionId}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (payload.new) {
            setSession(payload.new as Session);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        () => {
          fetchSession();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
        () => {
          fetchSession();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_assignments' },
        () => {
          fetchSession();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchSession]);

  const updateSession = async (data: Partial<Session>) => {
    const { error } = await supabase
      .from('sessions')
      .update(data)
      .eq('id', sessionId);

    if (error) throw error;
  };

  const addParticipant = async (name: string): Promise<Participant> => {
    const { data, error } = await supabase
      .from('participants')
      .insert({ session_id: sessionId, name })
      .select()
      .single();

    if (error) throw error;
    return data;
  };

  const removeParticipant = async (id: string) => {
    const { error } = await supabase.from('participants').delete().eq('id', id);
    if (error) throw error;
  };

  const addItem = async (item: Omit<Item, 'id' | 'session_id' | 'created_at'>): Promise<Item> => {
    const { data, error } = await supabase
      .from('items')
      .insert({ ...item, session_id: sessionId })
      .select()
      .single();

    if (error) throw error;
    return data;
  };

  const updateItem = async (id: string, data: Partial<Item>) => {
    const { error } = await supabase.from('items').update(data).eq('id', id);
    if (error) throw error;
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw error;
  };

  const updateAssignments = async (itemId: string, request: UpdateAssignmentsRequest) => {
    // Delete existing assignments
    await supabase.from('item_assignments').delete().eq('item_id', itemId);

    // Insert new assignments
    if (request.assignments.length > 0) {
      const { error } = await supabase.from('item_assignments').insert(
        request.assignments.map((a) => ({
          item_id: itemId,
          participant_id: a.participant_id,
          split_type: a.split_type,
          percentage: a.percentage || null,
        }))
      );

      if (error) throw error;
    }
  };

  return {
    session,
    participants,
    items,
    isLoading,
    error,
    updateSession,
    addParticipant,
    removeParticipant,
    addItem,
    updateItem,
    deleteItem,
    updateAssignments,
  };
}
