const NUMBER_FORMAT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return NUMBER_FORMAT.format(Math.round(value));
}

export function formatIDR(value: number | null | undefined): string {
  return `IDR ${formatNumber(value)}`;
}
