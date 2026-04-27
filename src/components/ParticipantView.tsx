'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Session, Participant, ItemWithAssignments, ParticipantBill } from '@/types';

interface ParticipantViewProps {
  session: Session;
  participant: Participant;
  allParticipants: Participant[];
  items: ItemWithAssignments[];
  bill: ParticipantBill | null;
  onClaimItem: (itemId: string, claim: boolean) => Promise<void>;
  onUpdateShare: (itemId: string, percentage: number) => Promise<void>;
}

export function ParticipantView({
  session,
  participant,
  allParticipants,
  items,
  bill,
  onClaimItem,
  onUpdateShare,
}: ParticipantViewProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [copiedBill, setCopiedBill] = useState(false);

  // Categorize items
  const { myItems, sharedItems, unclaimedItems } = useMemo(() => {
    const my: ItemWithAssignments[] = [];
    const shared: ItemWithAssignments[] = [];
    const unclaimed: ItemWithAssignments[] = [];

    items.forEach((item) => {
      const myAssignment = item.assignments.find(
        (a) => a.participant_id === participant.id
      );
      const hasOtherAssignments = item.assignments.some(
        (a) => a.participant_id !== participant.id
      );

      if (myAssignment) {
        if (hasOtherAssignments) {
          shared.push(item);
        } else {
          my.push(item);
        }
      } else if (item.assignments.length === 0) {
        unclaimed.push(item);
      }
    });

    return { myItems: my, sharedItems: shared, unclaimedItems: unclaimed };
  }, [items, participant.id]);

  const handleClaim = useCallback(
    async (itemId: string, claim: boolean) => {
      setClaimingId(itemId);
      try {
        await onClaimItem(itemId, claim);
      } finally {
        setClaimingId(null);
      }
    },
    [onClaimItem]
  );

  const handleCopyBill = useCallback(async () => {
    if (!bill) return;

    const itemLines = bill.items
      .map((pItem) => `  ${pItem.item.name}: $${pItem.share_amount.toFixed(2)}`)
      .join('\n');

    const text = `My Bill - ${participant.name}
${itemLines}
  ─────────────
  Subtotal: $${bill.subtotal.toFixed(2)}
  Tax: $${bill.tax_share.toFixed(2)}
  Service: $${bill.service_share.toFixed(2)}
  ─────────────
  Total: $${bill.total.toFixed(2)}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedBill(true);
      setTimeout(() => setCopiedBill(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [bill, participant.name]);

  const getItemSharedWith = (item: ItemWithAssignments) => {
    return item.assignments
      .filter((a) => a.participant_id !== participant.id)
      .map((a) => allParticipants.find((p) => p.id === a.participant_id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  const getMyPercentage = (item: ItemWithAssignments) => {
    const assignment = item.assignments.find(
      (a) => a.participant_id === participant.id
    );
    return assignment?.percentage || 100 / item.assignments.length;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-sm text-blue-600">Viewing as</p>
        <p className="text-xl font-bold text-blue-800">{participant.name}</p>
      </div>

      {/* My Bill Summary */}
      {bill && (
        <section className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">My Bill</h2>
            <button
              onClick={handleCopyBill}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {copiedBill ? '✓ Copied!' : 'Copy'}
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {bill.items.map((pItem) => (
              <div key={pItem.item.id} className="flex justify-between">
                <span className="text-gray-600">
                  {pItem.item.name}
                  {pItem.share_percentage < 100 && (
                    <span className="text-gray-400 ml-1">
                      ({pItem.share_percentage.toFixed(0)}%)
                    </span>
                  )}
                </span>
                <span>${pItem.share_amount.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>${bill.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax</span>
              <span>${bill.tax_share.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Service</span>
              <span>${bill.service_share.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>Total</span>
              <span>${bill.total.toFixed(2)}</span>
            </div>
          </div>
        </section>
      )}

      {/* My Items */}
      {myItems.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">My Items</h2>
          <div className="space-y-3">
            {myItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-500">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => handleClaim(item.id, false)}
                  disabled={claimingId === item.id}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {claimingId === item.id ? '...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shared Items */}
      {sharedItems.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Shared Items</h2>
          <div className="space-y-3">
            {sharedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-yellow-50 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500">
                      ${(item.price * item.quantity).toFixed(2)} total
                    </p>
                    <p className="text-xs text-gray-400">
                      Shared with: {getItemSharedWith(item)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      My share: {getMyPercentage(item).toFixed(0)}%
                    </p>
                    <p className="text-sm text-gray-600">
                      ${((item.price * item.quantity * getMyPercentage(item)) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unclaimed Items */}
      {unclaimedItems.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">
            Unclaimed Items ({unclaimedItems.length})
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Click an item to claim it as yours
          </p>
          <div className="space-y-2">
            {unclaimedItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleClaim(item.id, true)}
                disabled={claimingId === item.id}
                className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                  {claimingId === item.id ? (
                    <span className="text-gray-400">...</span>
                  ) : (
                    <svg
                      className="w-5 h-5 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Receipt Summary */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Receipt Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span>${session.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tax ({session.tax_percentage}%)</span>
            <span>${session.tax_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Service ({session.service_percentage}%)</span>
            <span>${session.service_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold pt-2 border-t">
            <span>Grand Total</span>
            <span>${session.grand_total.toFixed(2)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
