'use client';

import { useState, useCallback } from 'react';
import type { Participant } from '@/types';

interface ParticipantManagerProps {
  participants: Participant[];
  onAdd: (name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  disabled?: boolean;
}

export function ParticipantManager({
  participants,
  onAdd,
  onRemove,
  disabled = false,
}: ParticipantManagerProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Name is required');
        return;
      }

      // Check for duplicate names
      const isDuplicate = participants.some(
        (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (isDuplicate) {
        setError('A participant with this name already exists');
        return;
      }

      setIsAdding(true);
      try {
        await onAdd(trimmedName);
        setName('');
      } catch (err) {
        setError('Failed to add participant');
      } finally {
        setIsAdding(false);
      }
    },
    [name, participants, onAdd]
  );

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

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Enter name"
          disabled={disabled || isAdding}
          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={disabled || isAdding || !name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {participants.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">
          No participants yet. Add someone to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((participant) => (
            <li
              key={participant.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <span className="font-medium">{participant.name}</span>
              <button
                onClick={() => handleRemove(participant.id)}
                disabled={disabled || removingId === participant.id}
                className="text-red-600 hover:text-red-700 disabled:opacity-50 p-1"
                title="Remove participant"
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
      )}
    </div>
  );
}
