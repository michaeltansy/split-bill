'use client';

import type { DiscountType } from '@/types';
import { formatIDR } from '@/lib/format';

interface DiscountInputProps {
  type: DiscountType;
  value: string;
  resolvedAmount: number;
  onChange: (type: DiscountType, value: string) => void;
  error?: string;
  disabled?: boolean;
}

const OPTIONS: Array<{ type: DiscountType; label: string }> = [
  { type: 'percentage', label: '%' },
  { type: 'amount', label: 'IDR' },
];

export function DiscountInput({
  type,
  value,
  resolvedAmount,
  onChange,
  error,
  disabled = false,
}: DiscountInputProps) {
  return (
    <div>
      <label htmlFor="discount-value" className="block text-sm font-medium text-text-primary mb-1">
        Discount
      </label>
      <div className="flex gap-2">
        <div className="flex shrink-0 rounded-lg border border-border-subtle overflow-hidden" role="group" aria-label="Discount type">
          {OPTIONS.map((option) => {
            const selected = option.type === type;
            return (
              <button
                key={option.type}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                // Switching type clears the value rather than converting it.
                onClick={() => !selected && onChange(option.type, '')}
                className={`px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                  selected
                    ? 'bg-brand-primary text-white'
                    : 'bg-surface-card text-text-primary hover:bg-brand-primary-soft'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <input
          id="discount-value"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          max={type === 'percentage' ? 100 : undefined}
          value={value}
          onChange={(e) => onChange(type, e.target.value)}
          placeholder="0"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="w-full min-w-0 px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-status-danger">{error}</p>
      ) : (
        type === 'percentage' &&
        resolvedAmount > 0 && (
          <p className="mt-1 text-xs text-text-secondary">−{formatIDR(resolvedAmount)}</p>
        )
      )}
    </div>
  );
}
