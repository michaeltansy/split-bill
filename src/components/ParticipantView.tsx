'use client';

import { useState, useCallback, useMemo } from 'react';
import type {
  Session,
  Participant,
  ItemWithAssignments,
  ParticipantBill,
  SessionBankAccount,
} from '@/types';
import { formatIDR, formatNumber } from '@/lib/format';
import { formatTransferBlock } from '@/lib/bankTransferText';
import { BankInfoCard } from '@/components/BankInfoCard';
import { MarkAsPaidButton } from '@/components/MarkAsPaidButton';

interface ParticipantViewProps {
  session: Session;
  participant: Participant;
  allParticipants: Participant[];
  items: ItemWithAssignments[];
  bill: ParticipantBill | null;
  bankAccount: SessionBankAccount | null;
  onClaimItem: (itemId: string, claim: boolean) => Promise<void>;
  onUpdateShare: (itemId: string, percentage: number) => Promise<void>;
  onMarkPaid: (participantId: string, paid: boolean) => Promise<void>;
}

export function ParticipantView({
  session,
  participant,
  allParticipants,
  items,
  bill,
  bankAccount,
  onClaimItem,
  onUpdateShare,
  onMarkPaid,
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
  Total: ${formatIDR(bill.total)}${formatTransferBlock(bankAccount)}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedBill(true);
      setTimeout(() => setCopiedBill(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [bill, participant.name, bankAccount]);

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
      <div className="bg-brand-primary-soft rounded-2xl p-4">
        <p className="text-sm text-text-secondary">Viewing as</p>
        <p className="text-xl font-bold text-text-primary">{participant.name}</p>
      </div>

      <BankInfoCard bankAccount={bankAccount} />

      {/* My Bill Summary */}
      {bill && (
        <section className="bg-surface-card rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">My Bill</h2>
            <button
              onClick={handleCopyBill}
              className="text-sm font-semibold text-brand-primary hover:text-brand-primary-hover"
            >
              {copiedBill ? '✓ Copied!' : 'Copy'}
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {bill.items.map((pItem) => (
              <div key={pItem.item.id} className="flex justify-between gap-2">
                <span className="text-text-primary truncate min-w-0">
                  {pItem.item.name}
                  {pItem.share_percentage < 100 && (
                    <span className="text-text-secondary ml-1">
                      ({formatNumber(pItem.share_percentage)}%)
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-text-primary">{formatIDR(pItem.share_amount)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-border-subtle mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">Subtotal</span>
              <span className="shrink-0 text-text-primary">{formatIDR(bill.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">Tax</span>
              <span className="shrink-0 text-text-primary">{formatIDR(bill.tax_share)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-secondary">Service</span>
              <span className="shrink-0 text-text-primary">{formatIDR(bill.service_share)}</span>
            </div>
            <div className="flex justify-between font-bold text-base sm:text-lg pt-2 border-t border-border-subtle gap-2 text-text-primary">
              <span>Total</span>
              <span className="shrink-0">{formatIDR(bill.total)}</span>
            </div>
          </div>
        </section>
      )}

      <MarkAsPaidButton participant={participant} onMarkPaid={onMarkPaid} />

      {/* My Items */}
      {myItems.length > 0 && (
        <section className="bg-surface-card rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">My Items</h2>
          <div className="space-y-3">
            {myItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-brand-primary-soft rounded-xl gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-text-primary">{item.name}</p>
                  <p className="text-sm text-text-secondary">
                    {formatIDR(item.price * item.quantity)}
                  </p>
                </div>
                <button
                  onClick={() => handleClaim(item.id, false)}
                  disabled={claimingId === item.id}
                  className="text-sm font-medium text-status-danger hover:opacity-80 disabled:opacity-50 shrink-0"
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
        <section className="bg-surface-card rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Shared Items</h2>
          <div className="space-y-3">
            {sharedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-surface-bg border border-border-subtle rounded-xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate text-text-primary">{item.name}</p>
                    <p className="text-sm text-text-secondary">
                      {formatIDR(item.price * item.quantity)} total
                    </p>
                    <p className="text-xs text-text-secondary break-words">
                      Shared with: {getItemSharedWith(item)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-text-primary">
                      My share: {formatNumber(getMyPercentage(item))}%
                    </p>
                    <p className="text-sm text-text-primary">
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
        <section className="bg-surface-card rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">
            Unclaimed Items ({unclaimedItems.length})
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            Click an item to claim it as yours
          </p>
          <div className="space-y-2">
            {unclaimedItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleClaim(item.id, true)}
                disabled={claimingId === item.id}
                className="w-full flex items-center justify-between p-3 border border-border-subtle rounded-xl hover:bg-brand-primary-soft hover:border-brand-primary disabled:opacity-50 text-left gap-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-text-primary">{item.name}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-text-secondary">Qty: {item.quantity}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium text-text-primary">
                    {formatIDR(item.price * item.quantity)}
                  </span>
                  {claimingId === item.id ? (
                    <span className="text-text-secondary">...</span>
                  ) : (
                    <svg
                      className="w-5 h-5 text-brand-primary"
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
      <section className="bg-surface-card rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4 text-text-primary">Receipt Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">Subtotal</span>
            <span className="shrink-0 text-text-primary">{formatIDR(session.subtotal)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">Tax ({formatNumber(session.tax_percentage)}%)</span>
            <span className="shrink-0 text-text-primary">{formatIDR(session.tax_amount)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">Service ({formatNumber(session.service_percentage)}%)</span>
            <span className="shrink-0 text-text-primary">{formatIDR(session.service_amount)}</span>
          </div>
          <div className="flex justify-between font-bold pt-2 border-t border-border-subtle gap-2 text-text-primary">
            <span>Grand Total</span>
            <span className="shrink-0">{formatIDR(session.grand_total)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
