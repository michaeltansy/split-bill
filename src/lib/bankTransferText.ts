import type { ParticipantBill, SessionBankAccount } from '@/types';
import { formatIDR } from './format';

// Formats a "Transfer to" block for clipboard copy. Returns an empty string
// (not a newline) when bank is null so callers can `${bill}${transferBlock}`
// without checking.
export function formatTransferBlock(bank: SessionBankAccount | null): string {
  if (!bank) return '';
  return `
  ─────────────
  Transfer to:
    ${bank.bank_name} - ${bank.bank_account_number}
    a/n ${bank.bank_account_holder}`;
}

// Formats the discount line for a copied bill. Empty when the participant has
// no discount share, so callers can interpolate it unconditionally.
export function formatDiscountLine(bill: ParticipantBill): string {
  if (!(bill.discount_share > 0)) return '';
  return `
  Discount: −${formatIDR(bill.discount_share)}`;
}

// Formats one participant's items and subtotal/discount/tax/service lines,
// each prefixed with `indent`. Shared by the per-bill copy and Copy All.
export function formatBillBreakdown(bill: ParticipantBill, indent = '  '): string {
  const itemLines = bill.items.map(
    (pItem) => `${indent}- ${pItem.item.name}: ${formatIDR(pItem.share_amount)}`
  );
  const discountLine =
    bill.discount_share > 0 ? [`${indent}Discount: −${formatIDR(bill.discount_share)}`] : [];

  return [
    ...itemLines,
    `${indent}Subtotal: ${formatIDR(bill.subtotal)}`,
    ...discountLine,
    `${indent}Tax: ${formatIDR(bill.tax_share)}`,
    `${indent}Service: ${formatIDR(bill.service_share)}`,
  ].join('\n');
}

// Formats every participant's total with their breakdown, plus the grand total
// for clipboard copy, with the bank transfer block (if any) appended at the end.
// Participants with nothing assigned show only their (zero) total.
export function formatAllParticipantsText(
  bills: ParticipantBill[],
  grandTotal: number,
  bank: SessionBankAccount | null
): string {
  const blocks = bills
    .map((bill) => {
      const header = `  ${bill.participant.name}: ${formatIDR(bill.total)}`;
      return bill.items.length > 0 ? `${header}\n${formatBillBreakdown(bill, '    ')}` : header;
    })
    .join('\n\n');
  return `Split Bill Summary
${blocks}
  ─────────────
  Grand Total: ${formatIDR(grandTotal)}${formatTransferBlock(bank)}`;
}
