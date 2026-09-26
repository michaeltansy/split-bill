'use client';

import { useState } from 'react';
import type { ParticipantBill, Participant, SessionBankAccount } from '@/types';
import { formatIDR, formatNumber } from '@/lib/format';
import {
  formatDiscountLine,
  formatTransferBlock,
  formatAllParticipantsText,
} from '@/lib/bankTransferText';

interface BillSummaryProps {
  bills: ParticipantBill[];
  totalAssigned: number;
  totalUnassigned: number;
  grandTotal: number;
  bankAccount?: SessionBankAccount | null;
  participants?: Participant[];
}

export function BillSummary({
  bills,
  totalAssigned,
  totalUnassigned,
  grandTotal,
  bankAccount = null,
  participants = [],
}: BillSummaryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = async () => {
    const text = formatAllParticipantsText(bills, grandTotal, bankAccount);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyBill = async (bill: ParticipantBill) => {
    const itemDetails = bill.items
      .map((pItem) => `  - ${pItem.item.name}: ${formatIDR(pItem.share_amount)}`)
      .join('\n');

    const text = `${bill.participant.name}'s Bill:
${itemDetails}
  Subtotal: ${formatIDR(bill.subtotal)}${formatDiscountLine(bill)}
  Tax: ${formatIDR(bill.tax_share)}
  Service: ${formatIDR(bill.service_share)}
  ─────────────
  Total: ${formatIDR(bill.total)}${formatTransferBlock(bankAccount)}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(bill.participant.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (bills.length === 0) {
    return (
      <div className="text-center py-8 text-text-secondary">
        <p>No bills to display yet.</p>
        <p className="text-sm mt-1">Add participants and assign items to see the breakdown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-surface-bg rounded-2xl p-4">
        <div className="flex justify-between items-center gap-3">
          <span className="font-medium text-text-primary">Grand Total</span>
          <span className="text-lg sm:text-xl font-bold text-text-primary break-words text-right">{formatIDR(grandTotal)}</span>
        </div>
        <div className="flex flex-wrap justify-between text-sm mt-2 gap-x-3 gap-y-1">
          <span className="text-status-success font-medium">Assigned: {formatIDR(totalAssigned)}</span>
          {totalUnassigned > 0 && (
            <span className="text-status-danger font-medium">Unassigned: {formatIDR(totalUnassigned)}</span>
          )}
        </div>
        {totalUnassigned > 0 && (
          <p className="text-xs text-status-danger mt-2">
            Some items haven&apos;t been assigned to participants yet.
          </p>
        )}
        <button
          onClick={handleCopyAll}
          className="mt-3 w-full py-2 text-sm font-medium border border-border-subtle bg-white text-text-primary rounded-xl hover:bg-brand-primary-soft hover:border-brand-primary transition-colors"
        >
          {copiedAll ? '✓ Copied!' : 'Copy All'}
        </button>
      </div>

      {/* Individual bills */}
      <div className="space-y-3">
        {bills.map((bill) => {
          const isExpanded = expandedId === bill.participant.id;
          const isCopied = copiedId === bill.participant.id;

          const participantRow = participants.find((p) => p.id === bill.participant.id);
          const isPaid = participantRow?.is_paid ?? false;
          const paidAt = participantRow?.paid_at ?? null;

          return (
            <div
              key={bill.participant.id}
              className="border border-border-subtle rounded-2xl overflow-hidden"
            >
              {/* Header - always visible */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-bg gap-3"
                onClick={() => setExpandedId(isExpanded ? null : bill.participant.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-brand-primary-soft text-brand-primary rounded-full flex items-center justify-center font-semibold shrink-0">
                    {bill.participant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <span className="font-medium text-text-primary truncate">{bill.participant.name}</span>
                    {isPaid ? (
                      <span
                        title={paidAt ? `Paid on ${new Date(paidAt).toLocaleString()}` : undefined}
                        className="text-xs font-semibold text-status-success"
                      >
                        Paid ✓
                      </span>
                    ) : (
                      <span className="text-xs text-text-secondary">Unpaid</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-base sm:text-lg font-semibold text-text-primary">{formatIDR(bill.total)}</span>
                  <svg
                    className={`w-5 h-5 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border-subtle px-4 py-3 bg-surface-bg">
                  {/* Items breakdown */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-semibold text-text-secondary uppercase">Items</p>
                    {bill.items.map((pItem) => {
                      return (
                        <div key={pItem.item.id} className="flex justify-between text-sm gap-2">
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
                      );
                    })}
                  </div>

                  {/* Subtotals */}
                  <div className="border-t border-border-subtle pt-2 space-y-1">
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-text-secondary">Items Subtotal</span>
                      <span className="shrink-0 text-text-primary">{formatIDR(bill.subtotal)}</span>
                    </div>
                    {bill.discount_share > 0 && (
                      <div className="flex justify-between text-sm gap-2">
                        <span className="text-text-secondary">Discount</span>
                        <span className="shrink-0 text-text-primary">−{formatIDR(bill.discount_share)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-text-secondary">Tax</span>
                      <span className="shrink-0 text-text-primary">{formatIDR(bill.tax_share)}</span>
                    </div>
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-text-secondary">Service</span>
                      <span className="shrink-0 text-text-primary">{formatIDR(bill.service_share)}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-1 border-t border-border-subtle gap-2 text-text-primary">
                      <span>Total</span>
                      <span className="shrink-0">{formatIDR(bill.total)}</span>
                    </div>
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyBill(bill);
                    }}
                    className="mt-3 w-full py-2 text-sm font-medium border border-border-subtle bg-white text-text-primary rounded-xl hover:bg-brand-primary-soft hover:border-brand-primary transition-colors"
                  >
                    {isCopied ? '✓ Copied!' : 'Copy Bill Details'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
