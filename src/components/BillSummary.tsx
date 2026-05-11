'use client';

import { useState } from 'react';
import type { ParticipantBill } from '@/types';

interface BillSummaryProps {
  bills: ParticipantBill[];
  totalAssigned: number;
  totalUnassigned: number;
  grandTotal: number;
}

export function BillSummary({
  bills,
  totalAssigned,
  totalUnassigned,
  grandTotal,
}: BillSummaryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyBill = async (bill: ParticipantBill) => {
    const itemDetails = bill.items
      .map((pItem) => {
        return `  - ${pItem.item.name}: IDR ${pItem.share_amount.toFixed(0)}`;
      })
      .join('\n');

    const text = `${bill.participant.name}'s Bill:
${itemDetails}
  Subtotal: IDR ${bill.subtotal.toFixed(0)}
  Tax: IDR ${bill.tax_share.toFixed(0)}
  Service: IDR ${bill.service_share.toFixed(0)}
  ─────────────
  Total: IDR ${bill.total.toFixed(0)}`;

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
      <div className="text-center py-8 text-gray-500">
        <p>No bills to display yet.</p>
        <p className="text-sm mt-1">Add participants and assign items to see the breakdown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="font-medium">Grand Total</span>
          <span className="text-xl font-bold">IDR {grandTotal.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-green-600">Assigned: IDR {totalAssigned.toFixed(0)}</span>
          {totalUnassigned > 0 && (
            <span className="text-orange-600">Unassigned: IDR {totalUnassigned.toFixed(0)}</span>
          )}
        </div>
        {totalUnassigned > 0 && (
          <p className="text-xs text-orange-600 mt-2">
            Some items haven&apos;t been assigned to participants yet.
          </p>
        )}
      </div>

      {/* Individual bills */}
      <div className="space-y-3">
        {bills.map((bill) => {
          const isExpanded = expandedId === bill.participant.id;
          const isCopied = copiedId === bill.participant.id;

          return (
            <div
              key={bill.participant.id}
              className="border rounded-lg overflow-hidden"
            >
              {/* Header - always visible */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(isExpanded ? null : bill.participant.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-medium">
                    {bill.participant.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{bill.participant.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">IDR {bill.total.toFixed(0)}</span>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                <div className="border-t px-4 py-3 bg-gray-50">
                  {/* Items breakdown */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-medium text-gray-500 uppercase">Items</p>
                    {bill.items.map((pItem) => {
                      return (
                        <div key={pItem.item.id} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {pItem.item.name}
                            {pItem.share_percentage < 100 && (
                              <span className="text-gray-400 ml-1">
                                ({pItem.share_percentage.toFixed(0)}%)
                              </span>
                            )}
                          </span>
                          <span>IDR {pItem.share_amount.toFixed(0)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Subtotals */}
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Items Subtotal</span>
                      <span>IDR {bill.subtotal.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tax</span>
                      <span>IDR {bill.tax_share.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Service</span>
                      <span>IDR {bill.service_share.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-1 border-t">
                      <span>Total</span>
                      <span>IDR {bill.total.toFixed(0)}</span>
                    </div>
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyBill(bill);
                    }}
                    className="mt-3 w-full py-2 text-sm border rounded hover:bg-white transition-colors"
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
