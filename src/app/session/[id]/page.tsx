'use client';

import { use, useCallback, useMemo, useState } from 'react';
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
import type { Session, ItemAssignment } from '@/types';

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const participantName = searchParams.get('participant');

  const {
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
    async (itemId: string, assignments: { participant_id: string; share_percentage: number }[]) => {
      await updateAssignments(itemId, {
        assignments: assignments.map((a) => ({
          participant_id: a.participant_id,
          split_type: assignments.length > 1 ? 'percentage' : 'equal',
          percentage: a.share_percentage,
        })),
      });
    },
    [updateAssignments]
  );

  const handleUpdateSession = useCallback(
    async (data: Partial<Session>) => {
      await updateSession(data);
    },
    [updateSession]
  );

  // Handler for participant claiming/unclaiming items
  const handleClaimItem = useCallback(
    async (itemId: string, claim: boolean) => {
      if (!currentParticipant) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      if (claim) {
        // Add this participant to the item's assignments
        const existingAssignments = item.assignments || [];
        const newAssignments = [
          ...existingAssignments.map((a) => ({
            participant_id: a.participant_id,
            split_type: 'equal' as const,
            percentage: 100 / (existingAssignments.length + 1),
          })),
          {
            participant_id: currentParticipant.id,
            split_type: 'equal' as const,
            percentage: 100 / (existingAssignments.length + 1),
          },
        ];
        await updateAssignments(itemId, { assignments: newAssignments });
      } else {
        // Remove this participant from the item's assignments
        const remainingAssignments = (item.assignments || [])
          .filter((a) => a.participant_id !== currentParticipant.id)
          .map((a, _, arr) => ({
            participant_id: a.participant_id,
            split_type: 'equal' as const,
            percentage: 100 / arr.length,
          }));
        await updateAssignments(itemId, { assignments: remainingAssignments });
      }
    },
    [currentParticipant, items, updateAssignments]
  );

  // Handler for updating share percentage
  const handleUpdateShare = useCallback(
    async (itemId: string, percentage: number) => {
      if (!currentParticipant) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const updatedAssignments = (item.assignments || []).map((a) => ({
        participant_id: a.participant_id,
        split_type: 'percentage' as const,
        percentage: a.participant_id === currentParticipant.id ? percentage : a.percentage || 0,
      }));

      await updateAssignments(itemId, { assignments: updatedAssignments });
    },
    [currentParticipant, items, updateAssignments]
  );

  if (isLoading) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">&#9888;&#65039;</div>
        <h1 className="text-2xl font-bold mb-2">Session not found</h1>
        <p className="text-gray-600 mb-4">
          This session may have expired or the link is incorrect.
        </p>
        <a
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go to Home Page
        </a>
      </main>
    );
  }

  // Participant mode: show simplified view
  if (participantName && currentParticipant) {
    return (
      <main className="min-h-screen p-4 md:p-8 bg-gray-50">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Split Bill</h1>
            <a
              href={`/session/${id}`}
              className="text-sm text-blue-600 hover:text-blue-700"
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
            onClaimItem={handleClaimItem}
            onUpdateShare={handleUpdateShare}
          />

          {/* Session info footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
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
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">&#128100;</div>
        <h1 className="text-2xl font-bold mb-2">Participant not found</h1>
        <p className="text-gray-600 mb-4">
          &quot;{participantName}&quot; is not in this session.
        </p>
        <div className="flex gap-4">
          <a
            href={`/session/${id}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            View Full Session
          </a>
        </div>
        {participants.length > 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 mb-2">Available participants:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {participants.map((p) => (
                <a
                  key={p.id}
                  href={`/session/${id}?participant=${encodeURIComponent(p.name)}`}
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm hover:bg-gray-200"
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
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Split Bill</h1>
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>

        {/* Share Modal */}
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          sessionId={id}
          participants={participants}
        />

        {/* Participant Links */}
        {participants.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-800 mb-2">
              Share individual links with participants:
            </p>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <a
                  key={p.id}
                  href={`/session/${id}?participant=${encodeURIComponent(p.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-white border border-blue-200 rounded-full text-sm text-blue-600 hover:bg-blue-100"
                >
                  {p.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Main content - responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Left column: Receipt Summary & Participants */}
          <div className="space-y-6">
            {/* Receipt Summary */}
            <section className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Receipt Summary</h2>
              <TaxServiceInput
                session={session}
                onUpdate={handleUpdateSession}
              />
            </section>

            {/* Participants */}
            <section className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">
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
            <section className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">
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
            <section className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Bill Summary</h2>
              <BillSummary
                bills={bills}
                totalAssigned={totalAssigned}
                totalUnassigned={totalUnassigned}
                grandTotal={session.grand_total}
              />
            </section>
          </div>
        </div>

        {/* Session info footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
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
