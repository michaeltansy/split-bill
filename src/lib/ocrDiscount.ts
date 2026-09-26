import type { DiscountType } from '@/types';

export interface ScannedDiscount {
  discount_type: DiscountType;
  discount_value: number;
}

/**
 * Normalise the discount the receipt parser returned. Receipts print the
 * discount as a negative line ("-193.050"), so the sign is dropped. Anything
 * unusable becomes "no discount".
 */
export function sanitiseDiscount(type: unknown, value: unknown): ScannedDiscount {
  const discount_type: DiscountType = type === 'amount' ? 'amount' : 'percentage';
  const num = Math.abs(Number(value));

  if (!Number.isFinite(num) || num === 0) {
    return { discount_type, discount_value: 0 };
  }
  if (discount_type === 'percentage' && num > 100) {
    return { discount_type, discount_value: 0 };
  }

  return { discount_type, discount_value: num };
}
