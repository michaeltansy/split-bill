'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Session } from '@/types';

// Owner-only affordances on the session page. Renders nothing unless the signed-in
// user is the session's creator, so it's safe to mount unconditionally.
export function SessionOwnerControls({
  sessionId,
  createdBy,
  status,
}: {
  sessionId: string;
  createdBy: string | null;
  status: Session['status'];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isOwner, setIsOwner] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setIsOwner(!!createdBy && data.user?.id === createdBy);
    });
    return () => {
      active = false;
    };
  }, [createdBy]);

  if (!isOwner) return null;

  const handleClose = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error();
      addToast('Session closed', 'success');
    } catch {
      addToast('Could not close the session.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      addToast('Session deleted', 'success', {
        duration: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            fetch(`/api/sessions/${sessionId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deleted_at: null }),
            }).catch(() => {});
          },
        },
      });
      router.push('/sessions');
    } catch {
      addToast('Could not delete the session.', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-primary-soft text-brand-primary">
        Owned by you
      </span>
      {status === 'active' && (
        <button
          onClick={handleClose}
          disabled={busy}
          className="text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Close
        </button>
      )}
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="text-sm font-medium text-text-secondary hover:text-status-danger disabled:opacity-50"
      >
        Delete
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete session?"
        message="This removes it from your list. You can undo right after, but it's permanently purged after 2 weeks."
        confirmLabel="Delete"
        isProcessing={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
