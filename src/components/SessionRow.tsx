'use client';

import Link from 'next/link';
import { formatIDR } from '@/lib/format';
import type { SessionSummary } from '@/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: SessionSummary['status'] }) {
  const styles: Record<SessionSummary['status'], string> = {
    active: 'bg-status-success/10 text-status-success',
    completed: 'bg-brand-primary-soft text-brand-primary',
    expired: 'bg-gray-100 text-text-secondary',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {label}
    </span>
  );
}

export function SessionRow({
  session,
  onDelete,
}: {
  session: SessionSummary;
  onDelete: (session: SessionSummary) => void;
}) {
  return (
    <div className="relative flex items-center bg-surface-card rounded-2xl border border-border-subtle shadow-sm hover:border-brand-primary transition-colors">
      <Link href={`/session/${session.id}`} className="flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="text-sm text-text-secondary">{formatDate(session.created_at)}</span>
          <span className="font-semibold text-text-primary">{formatIDR(session.grand_total)}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={session.status} />
          <span className="text-xs text-text-secondary">
            {session.participant_count}{' '}
            {session.participant_count === 1 ? 'person' : 'people'}
          </span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onDelete(session)}
        aria-label="Delete session"
        className="p-3 mr-1 text-text-secondary hover:text-status-danger rounded-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
