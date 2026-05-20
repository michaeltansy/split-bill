'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { SessionRow } from '@/components/SessionRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ListSessionsResponse, SessionSummary, SessionTab } from '@/types';

interface TabState {
  sessions: SessionSummary[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
}

const TABS: { key: SessionTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
];

async function fetchPage(tab: SessionTab, cursor: string | null): Promise<ListSessionsResponse> {
  const params = new URLSearchParams({ tab });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/sessions?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function SessionListTabs({ initialActive }: { initialActive: ListSessionsResponse }) {
  const { addToast } = useToast();
  const [tab, setTab] = useState<SessionTab>('active');
  const [state, setState] = useState<Record<SessionTab, TabState>>({
    active: {
      sessions: initialActive.sessions,
      nextCursor: initialActive.next_cursor,
      loaded: true,
      loading: false,
    },
    expired: { sessions: [], nextCursor: null, loaded: false, loading: false },
  });
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const current = state[tab];

  const loadTab = useCallback(async (which: SessionTab, cursor: string | null) => {
    setState((prev) => ({ ...prev, [which]: { ...prev[which], loading: true } }));
    try {
      const page = await fetchPage(which, cursor);
      setState((prev) => ({
        ...prev,
        [which]: {
          sessions: cursor ? [...prev[which].sessions, ...page.sessions] : page.sessions,
          nextCursor: page.next_cursor,
          loaded: true,
          loading: false,
        },
      }));
    } catch {
      setState((prev) => ({ ...prev, [which]: { ...prev[which], loading: false } }));
      addToast('Could not load sessions. Please try again.', 'error');
    }
  }, [addToast]);

  // Lazy-load a tab the first time it's opened.
  useEffect(() => {
    if (!state[tab].loaded && !state[tab].loading) {
      loadTab(tab, null);
    }
  }, [tab, state, loadTab]);

  const restore = useCallback(
    async (session: SessionSummary, fromTab: SessionTab, index: number) => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null }),
        });
        if (!res.ok) throw new Error();
        setState((prev) => {
          const next = [...prev[fromTab].sessions];
          next.splice(Math.min(index, next.length), 0, session);
          return { ...prev, [fromTab]: { ...prev[fromTab], sessions: next } };
        });
      } catch {
        addToast('Could not restore the session.', 'error');
      }
    },
    [addToast]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const session = pendingDelete;
    const fromTab = tab;
    const index = state[fromTab].sessions.findIndex((s) => s.id === session.id);
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      // Remove locally, then offer Undo.
      setState((prev) => ({
        ...prev,
        [fromTab]: {
          ...prev[fromTab],
          sessions: prev[fromTab].sessions.filter((s) => s.id !== session.id),
        },
      }));
      setPendingDelete(null);
      addToast('Session deleted', 'success', {
        duration: 6000,
        action: { label: 'Undo', onClick: () => restore(session, fromTab, index) },
      });
    } catch {
      addToast('Could not delete the session.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, tab, state, addToast, restore]);

  return (
    <div>
      <div className="flex border-b border-border-subtle mb-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-3 text-sm font-medium ${
              tab === key
                ? 'text-brand-primary border-b-2 border-brand-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {current.loading && current.sessions.length === 0 ? (
        <p className="text-center text-sm text-text-secondary py-8">Loading…</p>
      ) : current.sessions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-secondary mb-4">
            {tab === 'active' ? 'No active sessions yet.' : 'No expired sessions.'}
          </p>
          {tab === 'active' && (
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover"
            >
              Create your first session
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {current.sessions.map((s) => (
            <SessionRow key={s.id} session={s} onDelete={setPendingDelete} />
          ))}

          {current.nextCursor && (
            <button
              onClick={() => loadTab(tab, current.nextCursor)}
              disabled={current.loading}
              className="w-full py-3 text-sm font-semibold text-brand-primary hover:bg-brand-primary-soft rounded-xl disabled:opacity-50"
            >
              {current.loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete session?"
        message="This removes it from your list. You can undo right after, but it's permanently purged after 2 weeks."
        confirmLabel="Delete"
        isProcessing={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
