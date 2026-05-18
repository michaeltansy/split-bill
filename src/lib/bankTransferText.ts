import type { SessionBankAccount } from '@/types';

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
