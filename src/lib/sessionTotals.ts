import { computeSessionTotals } from '@/lib/calculations';
import { validateDiscount } from '@/lib/validation';
import type { DiscountType } from '@/types';

export interface SessionMoneyInput {
  subtotal?: unknown;
  tax_amount?: unknown;
  service_amount?: unknown;
  discount_type?: unknown;
  discount_value?: unknown;
}

export interface SessionMoneyValues {
  subtotal: number;
  tax_amount: number;
  service_amount: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  grand_total: number;
  tax_percentage: number;
  service_percentage: number;
}

export type SessionMoneyResult =
  | { ok: true; values: SessionMoneyValues }
  | { ok: false; code: 'INVALID_INPUT' | 'INVALID_DISCOUNT'; error: string };

/**
 * Validate the money inputs of a session and derive everything else from them
 * on the server: discount amount, grand total and tax/service percentages.
 * Missing amounts default to 0 and a missing discount to 0%.
 */
export function buildSessionMoney(input: SessionMoneyInput): SessionMoneyResult {
  const subtotal = toAmount(input.subtotal);
  const tax_amount = toAmount(input.tax_amount);
  const service_amount = toAmount(input.service_amount);

  if (subtotal === null || tax_amount === null || service_amount === null) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Subtotal, tax and service must be non-negative numbers',
    };
  }

  const discount_type = input.discount_type ?? 'percentage';
  const rawValue = input.discount_value ?? 0;
  const discount = validateDiscount(discount_type, rawValue, subtotal);
  if (!discount.isValid) {
    return { ok: false, code: 'INVALID_DISCOUNT', error: discount.error ?? 'Invalid discount' };
  }

  const values = {
    subtotal,
    tax_amount,
    service_amount,
    discount_type: discount_type as DiscountType,
    discount_value: rawValue === '' ? 0 : Number(rawValue),
  };

  return { ok: true, values: { ...values, ...computeSessionTotals(values) } };
}

function toAmount(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) return null;
  return num;
}
