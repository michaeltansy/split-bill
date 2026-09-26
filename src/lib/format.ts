const NUMBER_FORMAT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return NUMBER_FORMAT.format(Math.round(value));
}

export function formatIDR(value: number | null | undefined): string {
  return `IDR ${formatNumber(value)}`;
}

const PERCENT_FORMAT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

/** Percentages keep up to 2 decimals, so 7.5 renders as "7,5". */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return PERCENT_FORMAT.format(value);
}

/** "Discount (15%)" for a percentage discount, "Discount" for a fixed amount. */
export function formatDiscountLabel(discount: {
  discount_type: 'percentage' | 'amount';
  discount_value: number;
}): string {
  return discount.discount_type === 'percentage'
    ? `Discount (${formatPercent(discount.discount_value)}%)`
    : 'Discount';
}
