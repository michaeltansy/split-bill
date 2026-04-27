'use client';

import { use, useCallback } from 'react';
import { useSession } from '@/hooks/useSession';
import { useBillCalculation } from '@/hooks/useBillCalculation';
import { useShareSession } from '@/hooks/useShareSession';
import { ParticipantManager } from '@/components/ParticipantManager';
import { ItemList } from '@/components/ItemList';
import { TaxServiceInput } from '@/components/TaxServiceInput';
import { BillSummary } from '@/components/BillSummary';
import type { Session, ItemAssignment } from '@/types';

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
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
  } = useSession(id);

  const { bills, totalAssigned, totalUnassigned } = useBillCalculation(
    session,
    items,
    participants
  );
  const { copyShareUrl, copied } = useShareSession(id);

  // Get all assignments as flat array
  const allAssignments: ItemAssignment[] = items.flatMap((item) => item.assignments || []);

  // Wrapper functions for components
  const handleAddParticipant = useCallback(
    async (name: string) => {
      await addParticipant(name);
    },
    [addParticipant]
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

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Split Bill</h1>
          <button
            onClick={copyShareUrl}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </>
            )}
          </button>
        </div>

        {/* Main content - responsive grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                onAdd={handleAddParticipant}
                onRemove={handleRemoveParticipant}
              />
            </section>
          </div>

          {/* Middle column: Items */}
          <div className="lg:col-span-1">
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
          <div className="lg:col-span-1">
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
