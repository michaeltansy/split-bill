'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { BANK_OPTIONS } from '@/lib/banks';
import type { BankCode, BankInfoInput } from '@/types';

interface BankInfoFormProps {
  disabled?: boolean;
  // Called whenever the form's resolved value changes:
  //   - null      = no/partial bank info (omit from POST)
  //   - object    = all three fields valid; ready to persist
  onChange: (value: BankInfoInput | null) => void;
}

const ACCOUNT_NUMBER_RE = /^[0-9]{8,20}$/;
const CUSTOM_BANK_NAME_MAX = 30;
const ACCOUNT_HOLDER_MAX = 80;

export function BankInfoForm({ disabled = false, onChange }: BankInfoFormProps) {
  const [bankCode, setBankCode] = useState<BankCode | null>(null);
  const [customBankName, setCustomBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  const resolvedBankName = useMemo(() => {
    if (!bankCode) return '';
    if (bankCode === 'Other') return customBankName.trim();
    return BANK_OPTIONS.find((b) => b.code === bankCode)?.storedName ?? '';
  }, [bankCode, customBankName]);

  const errors = useMemo(() => {
    const e: { bank?: string; number?: string; holder?: string } = {};
    if (bankCode === 'Other' && customBankName.length > CUSTOM_BANK_NAME_MAX) {
      e.bank = `Bank name must be ${CUSTOM_BANK_NAME_MAX} characters or fewer.`;
    }
    if (accountNumber.length > 0 && !ACCOUNT_NUMBER_RE.test(accountNumber)) {
      e.number = 'Account number must be 8–20 digits.';
    }
    if (accountHolder.length > ACCOUNT_HOLDER_MAX) {
      e.holder = `Account holder must be ${ACCOUNT_HOLDER_MAX} characters or fewer.`;
    }
    return e;
  }, [bankCode, customBankName, accountNumber, accountHolder]);

  const isComplete =
    !!resolvedBankName &&
    ACCOUNT_NUMBER_RE.test(accountNumber) &&
    accountHolder.trim().length > 0 &&
    accountHolder.length <= ACCOUNT_HOLDER_MAX &&
    !errors.bank;

  // Surface the resolved value (or null) upstream whenever any input changes.
  useEffect(() => {
    if (isComplete) {
      onChange({
        bank_name: resolvedBankName,
        bank_account_number: accountNumber,
        bank_account_holder: accountHolder.trim(),
      });
    } else {
      onChange(null);
    }
  }, [isComplete, resolvedBankName, accountNumber, accountHolder, onChange]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Bank
          <span className="font-normal text-text-secondary ml-1">(optional — share where to transfer)</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BANK_OPTIONS.map((opt) => {
            const selected = bankCode === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setBankCode(selected ? null : opt.code)}
                disabled={disabled}
                aria-pressed={selected}
                className={`flex flex-col items-center justify-center gap-1 p-2 border rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                  selected
                    ? 'border-brand-primary bg-brand-primary-soft text-text-primary'
                    : 'border-border-subtle bg-white text-text-primary hover:border-brand-primary'
                }`}
              >
                <div className="w-10 h-10 flex items-center justify-center">
                  {opt.logoSrc ? (
                    <Image
                      src={opt.logoSrc}
                      alt={opt.label}
                      width={40}
                      height={40}
                      className="rounded-lg"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: opt.accent }}
                    >
                      ?
                    </div>
                  )}
                </div>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {bankCode === 'Other' && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Bank name
          </label>
          <input
            type="text"
            value={customBankName}
            onChange={(e) => setCustomBankName(e.target.value)}
            disabled={disabled}
            maxLength={CUSTOM_BANK_NAME_MAX}
            placeholder="e.g. Mandiri"
            className="w-full px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
          />
          {errors.bank && <p className="mt-1 text-xs text-status-danger">{errors.bank}</p>}
        </div>
      )}

      {bankCode && (
        <>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Account number
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              disabled={disabled}
              maxLength={20}
              placeholder="8–20 digits"
              className="w-full px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            {errors.number && <p className="mt-1 text-xs text-status-danger">{errors.number}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Account holder
            </label>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              disabled={disabled}
              maxLength={ACCOUNT_HOLDER_MAX}
              placeholder="Name on the bank account"
              className="w-full px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            {errors.holder && <p className="mt-1 text-xs text-status-danger">{errors.holder}</p>}
          </div>
        </>
      )}
    </div>
  );
}
