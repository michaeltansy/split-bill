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

// Formats every participant's total plus the grand total for clipboard copy,
// with the bank transfer block (if any) appended at the end.
export function formatAllParticipantsText(
  bills: ParticipantBill[],
  grandTotal: number,
  bank: SessionBankAccount | null
): string {
  const lines = bills.map((bill) => `  ${bill.participant.name}: ${formatIDR(bill.total)}`).join('\n');
  return `Split Bill Summary
${lines}
  ─────────────
  Grand Total: ${formatIDR(grandTotal)}${formatTransferBlock(bank)}`;
}
