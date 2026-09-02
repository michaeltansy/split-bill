'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountMenu } from '@/components/AccountMenu';
import { formatIDR } from '@/lib/format';
import type { Session } from '@/types';

interface SessionsResponse {
  sessions: Session[];
  nextCursor: string | null;
}

const STATUS_STYLES: Record<Session['status'], string> = {
  active: 'bg-brand-primary-soft text-brand-primary',
  completed: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionHistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (afterCursor: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '10' });
      if (afterCursor) params.set('cursor', afterCursor);

      const res = await fetch(`/api/sessions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load session history');
      const data: SessionsResponse = await res.json();

      setSessions((prev) => (afterCursor ? [...prev, ...data.sessions] : data.sessions));
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session history');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    loadPage(null);
  }, [loadPage]);

  return (
    <main className="min-h-screen bg-surface-bg py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-end mb-4">
          <AccountMenu />
        </div>

        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Session History</h1>
            <p className="text-text-secondary mt-1">Sessions you&apos;ve created, most recent first.</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-brand-primary text-white text-sm font-semibold rounded-xl hover:bg-brand-primary-hover shrink-0"
          >
            New Session
          </Link>
        </header>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-status-danger rounded-xl text-sm">{error}</div>
        )}

        {!hasLoadedOnce && isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {hasLoadedOnce && sessions.length === 0 && !error && (
          <div className="text-center py-16 bg-surface-card rounded-2xl">
            <p className="text-text-secondary mb-4">You haven&apos;t created any sessions yet.</p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover"
            >
              Create your first session
            </Link>
          </div>
        )}

        {sessions.length > 0 && (
          <ul className="space-y-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/session/${session.id}`}
                  className="block bg-surface-card rounded-2xl shadow-sm p-5 hover:ring-2 hover:ring-brand-primary transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-text-secondary">{formatDate(session.created_at)}</p>
                      <p className="text-lg font-semibold text-text-primary mt-1">
                        {formatIDR(session.grand_total)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[session.status]}`}
                    >
                      {session.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {cursor && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => loadPage(cursor)}
              disabled={isLoading}
              className="px-5 py-2.5 bg-surface-card border border-border-subtle text-text-primary font-semibold rounded-xl hover:bg-brand-primary-soft disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
