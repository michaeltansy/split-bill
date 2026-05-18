'use client';

import { useState, useCallback } from 'react';
import type { Participant } from '@/types';

interface ParticipantManagerProps {
  participants: Participant[];
  onCommit: (names: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  disabled?: boolean;
}

export function ParticipantManager({
  participants,
  onCommit,
  onRemove,
  disabled = false,
}: ParticipantManagerProps) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleStage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmed = name.trim();
      if (!trimmed) {
        setError('Name is required');
        return;
      }

      const lower = trimmed.toLowerCase();
      const dupCommitted = participants.some((p) => p.name.toLowerCase() === lower);
      const dupPending = pending.some((n) => n.toLowerCase() === lower);

      if (dupCommitted || dupPending) {
        setError('A participant with this name already exists');
        return;
      }

      setPending((prev) => [...prev, trimmed]);
      setName('');
    },
    [name, participants, pending]
  );

  const handleUnstage = useCallback((idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleCommit = useCallback(async () => {
    if (pending.length === 0) return;
    setIsCommitting(true);
    setError(null);
    try {
      await onCommit(pending);
      setPending([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add participants');
    } finally {
      setIsCommitting(false);
    }
  }, [pending, onCommit]);

  const handleRemove = useCallback(
    async (id: string) => {
      setRemovingId(id);
      try {
        await onRemove(id);
      } catch (err) {
        setError('Failed to remove participant');
      } finally {
        setRemovingId(null);
      }
    },
    [onRemove]
  );

  const isBusy = disabled || isCommitting;

  return (
    <div className="space-y-4">
      <form onSubmit={handleStage} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Enter name"
          disabled={isBusy}
          className="flex-1 px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={isBusy || !name.trim()}
          className="px-4 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>

      {error && <p className="text-sm text-status-danger">{error}</p>}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Pending ({pending.length})
          </p>
          <ul className="space-y-2">
            {pending.map((n, i) => (
              <li
                key={`${n}-${i}`}
                className="flex items-center justify-between p-3 bg-brand-primary-soft border border-border-subtle rounded-xl"
              >
                <span className="font-medium text-text-primary">{n}</span>
                <button
                  onClick={() => handleUnstage(i)}
                  disabled={isBusy}
                  className="text-text-secondary hover:text-status-danger disabled:opacity-50 p-1"
                  title="Remove from pending"
                  aria-label={`Remove ${n} from pending`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={handleCommit}
            disabled={isBusy}
            className="w-full px-4 py-2 bg-status-success text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCommitting ? 'Updating…' : `Update (${pending.length})`}
          </button>
        </div>
      )}

      {participants.length === 0 && pending.length === 0 ? (
        <p className="text-text-secondary text-sm py-4 text-center">
          No participants yet. Add someone to get started.
        </p>
      ) : participants.length > 0 ? (
        <div className="space-y-2">
          {pending.length > 0 && (
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Confirmed ({participants.length})
            </p>
          )}
          <ul className="space-y-2">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center justify-between p-3 bg-surface-bg rounded-xl"
              >
                <span className="font-medium text-text-primary">{participant.name}</span>
                <button
                  onClick={() => handleRemove(participant.id)}
                  disabled={isBusy || removingId === participant.id}
                  className="text-status-danger hover:opacity-80 disabled:opacity-50 p-1"
                  title="Remove participant"
                  aria-label={`Remove ${participant.name}`}
                >
                  {removingId === participant.id ? (
                    <span className="text-sm">...</span>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
