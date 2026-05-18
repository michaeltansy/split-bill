'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { resolveBankLogo, resolveBankAccent } from '@/lib/banks';
import type { SessionBankAccount } from '@/types';

interface BankInfoCardProps {
  bankAccount: SessionBankAccount | null;
}

export function BankInfoCard({ bankAccount }: BankInfoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!bankAccount) return;
    try {
      await navigator.clipboard.writeText(bankAccount.bank_account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [bankAccount]);

  if (!bankAccount) return null;

  const logo = resolveBankLogo(bankAccount.bank_name);
  const accent = resolveBankAccent(bankAccount.bank_name);

  return (
    <section className="bg-surface-card rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-4 text-text-primary">Transfer to</h2>
      <div className="flex items-center gap-3">
        {logo ? (
          <Image
            src={logo}
            alt={bankAccount.bank_name}
            width={48}
            height={48}
            className="rounded-xl shrink-0"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: accent }}
            aria-label={bankAccount.bank_name}
          >
            {bankAccount.bank_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">
            {bankAccount.bank_name}
          </p>
          <p className="text-xs text-text-secondary truncate">
            a/n {bankAccount.bank_account_holder}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-surface-bg border border-border-subtle rounded-lg text-text-primary font-mono tracking-wider text-sm truncate">
          {bankAccount.bank_account_number}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover text-sm whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
