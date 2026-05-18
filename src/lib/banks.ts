import type { BankCode } from '@/types';

export interface BankOption {
  code: BankCode;
  label: string;
  // Persisted bank_name string for curated entries; Other uses user-supplied free text.
  storedName: string | null;
  logoSrc: string | null;
  // Background tint applied behind the logo tile when this bank is selected/displayed.
  accent: string;
}

export const BANK_OPTIONS: BankOption[] = [
  { code: 'BCA', label: 'BCA', storedName: 'BCA', logoSrc: '/banks/bca.svg', accent: '#0060AF' },
  { code: 'Jago', label: 'Jago', storedName: 'Jago', logoSrc: '/banks/jago.svg', accent: '#FF6F2C' },
  { code: 'GoPay', label: 'GoPay', storedName: 'GoPay', logoSrc: '/banks/gopay.svg', accent: '#00AED6' },
  { code: 'Other', label: 'Other', storedName: null, logoSrc: null, accent: '#4A4A4A' },
];

const CURATED_BY_NAME: Record<string, BankOption> = Object.fromEntries(
  BANK_OPTIONS.filter((b) => b.storedName).map((b) => [b.storedName!.toLowerCase(), b])
);

// Resolve a curated logo for a persisted bank_name string. Free-text "Other"
// values fall through to null so the UI can render a neutral fallback.
export function resolveBankLogo(bank_name: string | null | undefined): string | null {
  if (!bank_name) return null;
  return CURATED_BY_NAME[bank_name.toLowerCase()]?.logoSrc ?? null;
}

export function resolveBankAccent(bank_name: string | null | undefined): string {
  if (!bank_name) return '#4A4A4A';
  return CURATED_BY_NAME[bank_name.toLowerCase()]?.accent ?? '#4A4A4A';
}

// Returns the BankCode for a curated stored name, or 'Other' for free text / null.
export function inferBankCode(bank_name: string | null | undefined): BankCode {
  if (!bank_name) return 'Other';
  return (CURATED_BY_NAME[bank_name.toLowerCase()]?.code ?? 'Other') as BankCode;
}
