'use client';

import { useState } from 'react';
import type { Participant } from '@/types';

interface MarkAsPaidButtonProps {
  participant: Participant;
  onMarkPaid: (participantId: string, paid: boolean) => Promise<void>;
}

function formatPaidAt(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function MarkAsPaidButton({ participant, onMarkPaid }: MarkAsPaidButtonProps) {
  const [isPending, setIsPending] = useState(false);

  const handleClick = async (next: boolean) => {
    setIsPending(true);
    try {
      await onMarkPaid(participant.id, next);
    } finally {
      setIsPending(false);
    }
  };

  if (participant.is_paid) {
    return (
      <section className="bg-surface-card rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-status-success text-white flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">Paid</p>
            <p className="text-xs text-text-secondary truncate">
              {formatPaidAt(participant.paid_at)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleClick(false)}
          disabled={isPending}
          className="text-sm font-medium text-text-secondary hover:text-status-danger disabled:opacity-50"
        >
          {isPending ? '…' : 'Undo'}
        </button>
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={() => handleClick(true)}
      disabled={isPending}
      className="w-full py-3 bg-status-success text-white text-base font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
    >
      {isPending ? 'Marking…' : 'Mark as Paid'}
    </button>
  );
}
