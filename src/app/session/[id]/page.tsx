'use client';

import { use, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { useBillCalculation } from '@/hooks/useBillCalculation';
import { useShareSession } from '@/hooks/useShareSession';
import { ParticipantManager } from '@/components/ParticipantManager';
import { ItemList } from '@/components/ItemList';
import { TaxServiceInput } from '@/components/TaxServiceInput';
import { BillSummary } from '@/components/BillSummary';
import { ParticipantView } from '@/components/ParticipantView';
import { ShareModal } from '@/components/ShareModal';
import { BankInfoCard } from '@/components/BankInfoCard';
import type { Session, ItemAssignment } from '@/types';
import type { AssignmentPayload } from '@/components/ItemCard';

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const participantName = searchParams?.get('participant') ?? null;

  const {
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
  } = useSession(id);

  const { bills, totalAssigned, totalUnassigned } = useBillCalculation(
    session,
    items,
    participants
  );
  const { copyShareUrl, copied } = useShareSession(id);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Find current participant if in participant mode
  const currentParticipant = useMemo(() => {
    if (!participantName) return null;
    return participants.find(
      (p) => p.name.toLowerCase() === participantName.toLowerCase()
    );
  }, [participantName, participants]);

  // Get participant's bill
  const participantBill = useMemo(() => {
    if (!currentParticipant) return null;
    return bills.find((b) => b.participant.id === currentParticipant.id) || null;
  }, [currentParticipant, bills]);

  // Get all assignments as flat array
  const allAssignments: ItemAssignment[] = items.flatMap((item) => item.assignments || []);

  // Wrapper functions for components
  const handleCommitParticipants = useCallback(
    async (names: string[]) => {
      await addParticipants(names);
    },
    [addParticipants]
  );

  const handleRemoveParticipant = useCallback(
    async (participantId: string) => {
      await removeParticipant(participantId);
    },
    [removeParticipant]
  );

  const handleAddItem = useCallback(
    async (data: { name: string; price: number; quantity: number }) => {
      await addItem(data);
    },
    [addItem]
  );

  const handleUpdateItem = useCallback(
    async (itemId: string, data: { name?: string; price?: number; quantity?: number }) => {
      await updateItem(itemId, data);
    },
    [updateItem]
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      await deleteItem(itemId);
    },
    [deleteItem]
  );

  const handleAssignItem = useCallback(
    async (itemId: string, assignments: AssignmentPayload[]) => {
      await updateAssignments(itemId, { assignments });
    },
    [updateAssignments]
  );

  const handleUpdateSession = useCallback(
    async (data: Partial<Session>) => {
      await updateSession(data);
    },
    [updateSession]
  );

  // Per-participant claim/unclaim with optimistic apply + rollback. The optimistic
  // row matches the realtime echo's (item_id, participant_id) key so the echo
  // idempotently replaces the placeholder when it arrives.
  const handleClaimItem = useCallback(
    async (itemId: string, claim: boolean) => {
      if (!currentParticipant) return;
      const pid = currentParticipant.id;

      if (claim) {
        const optimistic: ItemAssignment = {
          id: `optimistic-${itemId}-${pid}`,
          item_id: itemId,
          session_id: id,
          participant_id: pid,
          split_type: 'equal',
          percentage: null,
          unit_count: null,
          created_at: new Date().toISOString(),
        };
        applyAssignmentLocally(optimistic);
        try {
          await claimItem(itemId, pid);
        } catch (e) {
          removeAssignmentLocally(itemId, pid);
          throw e;
        }
      } else {
        const prior = items
          .find((i) => i.id === itemId)
          ?.assignments.find((a) => a.participant_id === pid);
        removeAssignmentLocally(itemId, pid);
        try {
          await unclaimItem(itemId, pid);
        } catch (e) {
          if (prior) applyAssignmentLocally(prior);
          throw e;
        }
      }
    },
    [
      currentParticipant,
      items,
      id,
      claimItem,
      unclaimItem,
      applyAssignmentLocally,
      removeAssignmentLocally,
    ]
  );

  // Percentage edit goes through the validated RPC. No optimistic update — the
  // server may reject (sum != 100) and rolling back a percentage value is hairy.
  const handleUpdateShare = useCallback(
    async (itemId: string, percentage: number) => {
      if (!currentParticipant) return;
      await setShare(itemId, currentParticipant.id, 'percentage', { percentage });
    },
    [currentParticipant, setShare]
  );

  if (isLoading) {
    return (
      <main className="min-h-screen p-4 md:p-8 bg-surface-bg">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-64 bg-gray-200 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 rounded-2xl"></div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-surface-bg">
        <div className="text-6xl mb-4">&#9888;&#65039;</div>
        <h1 className="text-2xl font-bold mb-2 text-text-primary">Session not found</h1>
        <p className="text-text-secondary mb-4">
          This session may have expired or the link is incorrect.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover"
        >
          Go to Home Page
        </Link>
      </main>
    );
  }

  // Participant mode: show simplified view
  if (participantName && currentParticipant) {
    return (
      <main className="min-h-screen p-4 md:p-8 bg-surface-bg">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-text-primary">Split Bill</h1>
            <a
              href={`/session/${id}`}
              className="text-sm font-semibold text-brand-primary hover:text-brand-primary-hover"
            >
              Full View
            </a>
          </div>

          <ParticipantView
            session={session}
            participant={currentParticipant}
            allParticipants={participants}
            items={items}
            bill={participantBill}
            bankAccount={bankAccount}
            onClaimItem={handleClaimItem}
            onUpdateShare={handleUpdateShare}
            onMarkPaid={markPaid}
          />

          {/* Session info footer */}
          <div className="mt-8 text-center text-sm text-text-secondary">
            <p>
              Session expires:{' '}
              {new Date(session.expires_at).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Participant name provided but not found
  if (participantName && !currentParticipant) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-surface-bg">
        <div className="text-6xl mb-4">&#128100;</div>
        <h1 className="text-2xl font-bold mb-2 text-text-primary">Participant not found</h1>
        <p className="text-text-secondary mb-4">
          &quot;{participantName}&quot; is not in this session.
        </p>
        <div className="flex gap-4">
          <a
            href={`/session/${id}`}
            className="px-4 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover"
          >
            View Full Session
          </a>
        </div>
        {participants.length > 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-text-secondary mb-2">Available participants:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {participants.map((p) => (
                <a
                  key={p.id}
                  href={`/session/${id}?participant=${encodeURIComponent(p.name)}`}
                  className="px-3 py-1 bg-brand-primary-soft text-text-primary rounded-full text-sm hover:bg-brand-primary hover:text-white transition-colors"
                >
                  {p.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
    );
  }

  // Owner view (default)
  return (
    <main className="min-h-screen p-4 md:p-8 bg-surface-bg">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary">Split Bill</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-4 py-2 bg-surface-card border border-border-subtle text-text-primary font-semibold rounded-xl hover:bg-brand-primary-soft flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </Link>
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="px-4 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </div>

        {/* Share Modal */}
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          sessionId={id}
          participants={participants}
          bankAccount={bankAccount}
        />

        {/* Participant Links */}
        {participants.length > 0 && (
          <div className="mb-6 p-4 bg-brand-primary-soft rounded-2xl">
            <p className="text-sm font-medium text-text-primary mb-2">
              Share individual links with participants:
            </p>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <a
                  key={p.id}
                  href={`/session/${id}?participant=${encodeURIComponent(p.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-white border border-border-subtle rounded-full text-sm font-medium text-brand-primary hover:bg-brand-primary hover:text-white hover:border-brand-primary transition-colors"
                >
                  {p.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Main content - responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Left column: Bank info, Receipt Summary & Participants */}
          <div className="space-y-6">
            <BankInfoCard bankAccount={bankAccount} />

            {/* Receipt Summary */}
            <section className="bg-surface-card rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-text-primary">Receipt Summary</h2>
              <TaxServiceInput
                session={session}
                onUpdate={handleUpdateSession}
              />
            </section>

            {/* Participants */}
            <section className="bg-surface-card rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-text-primary">
                Participants ({participants.length})
              </h2>
              <ParticipantManager
                participants={participants}
                onCommit={handleCommitParticipants}
                onRemove={handleRemoveParticipant}
              />
            </section>
          </div>

          {/* Middle column: Items */}
          <div className="md:col-span-1">
            <section className="bg-surface-card rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-text-primary">
                Items ({items.length})
              </h2>
              <ItemList
                items={items}
                participants={participants}
                assignments={allAssignments}
                onAdd={handleAddItem}
                onUpdate={handleUpdateItem}
                onDelete={handleDeleteItem}
                onAssign={handleAssignItem}
              />
            </section>
          </div>

          {/* Right column: Bill Summary */}
          <div className="md:col-span-2 lg:col-span-1">
            <section className="bg-surface-card rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-text-primary">Bill Summary</h2>
              <BillSummary
                bills={bills}
                totalAssigned={totalAssigned}
                totalUnassigned={totalUnassigned}
                grandTotal={session.grand_total}
                bankAccount={bankAccount}
                participants={participants}
              />
            </section>
          </div>
        </div>

        {/* Session info footer */}
        <div className="mt-8 text-center text-sm text-text-secondary">
          <p>
            Session expires:{' '}
            {new Date(session.expires_at).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>
    </main>
  );
}
