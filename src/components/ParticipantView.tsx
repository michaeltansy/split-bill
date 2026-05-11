'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Session, Participant, ItemWithAssignments, ParticipantBill } from '@/types';
import { formatIDR, formatNumber } from '@/lib/format';

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
      .map((pItem) => `  ${pItem.item.name}: ${formatIDR(pItem.share_amount)}`)
      .join('\n');

    const text = `My Bill - ${participant.name}
${itemLines}
  ─────────────
  Subtotal: ${formatIDR(bill.subtotal)}
  Tax: ${formatIDR(bill.tax_share)}
  Service: ${formatIDR(bill.service_share)}
  ─────────────
  Total: ${formatIDR(bill.total)}`;

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
              <div key={pItem.item.id} className="flex justify-between gap-2">
                <span className="text-gray-600 truncate min-w-0">
                  {pItem.item.name}
                  {pItem.share_percentage < 100 && (
                    <span className="text-gray-400 ml-1">
                      ({formatNumber(pItem.share_percentage)}%)
                    </span>
                  )}
                </span>
                <span className="shrink-0">{formatIDR(pItem.share_amount)}</span>
              </div>
            ))}
          </div>

          <div className="border-t mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500 gap-2">
              <span>Subtotal</span>
              <span className="shrink-0">{formatIDR(bill.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500 gap-2">
              <span>Tax</span>
              <span className="shrink-0">{formatIDR(bill.tax_share)}</span>
            </div>
            <div className="flex justify-between text-gray-500 gap-2">
              <span>Service</span>
              <span className="shrink-0">{formatIDR(bill.service_share)}</span>
            </div>
            <div className="flex justify-between font-bold text-base sm:text-lg pt-2 border-t gap-2">
              <span>Total</span>
              <span className="shrink-0">{formatIDR(bill.total)}</span>
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
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatIDR(item.price * item.quantity)}
                  </p>
                </div>
                <button
                  onClick={() => handleClaim(item.id, false)}
                  disabled={claimingId === item.id}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 shrink-0"
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatIDR(item.price * item.quantity)} total
                    </p>
                    <p className="text-xs text-gray-400 break-words">
                      Shared with: {getItemSharedWith(item)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">
                      My share: {formatNumber(getMyPercentage(item))}%
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatIDR((item.price * item.quantity * getMyPercentage(item)) / 100)}
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
                className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{item.name}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">
                    {formatIDR(item.price * item.quantity)}
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
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Subtotal</span>
            <span className="shrink-0">{formatIDR(session.subtotal)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Tax ({formatNumber(session.tax_percentage)}%)</span>
            <span className="shrink-0">{formatIDR(session.tax_amount)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Service ({formatNumber(session.service_percentage)}%)</span>
            <span className="shrink-0">{formatIDR(session.service_amount)}</span>
          </div>
          <div className="flex justify-between font-bold pt-2 border-t gap-2">
            <span>Grand Total</span>
            <span className="shrink-0">{formatIDR(session.grand_total)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
