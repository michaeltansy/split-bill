import { describe, it, expect } from 'vitest'
import { formatNumber, formatIDR, formatPercent, formatDiscountLabel } from './format'

describe('formatNumber', () => {
  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('formats whole numbers with Indonesian thousands separator (dot)', () => {
    expect(formatNumber(1000)).toBe('1.000')
    expect(formatNumber(1000000)).toBe('1.000.000')
    expect(formatNumber(58000)).toBe('58.000')
  })

  it('rounds to the nearest integer before formatting', () => {
    expect(formatNumber(1234.7)).toBe('1.235')
    expect(formatNumber(1234.4)).toBe('1.234')
  })

  it('returns "0" for null', () => {
    expect(formatNumber(null)).toBe('0')
  })

  it('returns "0" for undefined', () => {
    expect(formatNumber(undefined)).toBe('0')
  })

  it('returns "0" for non-finite values', () => {
    expect(formatNumber(Infinity)).toBe('0')
    expect(formatNumber(-Infinity)).toBe('0')
    expect(formatNumber(NaN)).toBe('0')
  })
})

describe('formatIDR', () => {
  it('prepends "IDR " to the formatted number', () => {
    expect(formatIDR(5000)).toBe('IDR 5.000')
    expect(formatIDR(1000000)).toBe('IDR 1.000.000')
  })

  it('formats zero as "IDR 0"', () => {
    expect(formatIDR(0)).toBe('IDR 0')
  })

  it('handles null and undefined', () => {
    expect(formatIDR(null)).toBe('IDR 0')
    expect(formatIDR(undefined)).toBe('IDR 0')
  })
})

describe('formatPercent', () => {
  it('keeps up to 2 decimals with a comma separator', () => {
    expect(formatPercent(7.5)).toBe('7,5')
    expect(formatPercent(10.7)).toBe('10,7')
    expect(formatPercent(12.345)).toBe('12,35')
    expect(formatPercent(10)).toBe('10')
  })

  it('returns "0" for missing or non-finite values', () => {
    expect(formatPercent(null)).toBe('0')
    expect(formatPercent(NaN)).toBe('0')
  })
})

describe('formatDiscountLabel', () => {
  it('shows the percentage for a percentage discount', () => {
    expect(formatDiscountLabel({ discount_type: 'percentage', discount_value: 15 })).toBe('Discount (15%)')
    expect(formatDiscountLabel({ discount_type: 'percentage', discount_value: 7.5 })).toBe('Discount (7,5%)')
  })

  it('shows a plain label for a fixed amount', () => {
    expect(formatDiscountLabel({ discount_type: 'amount', discount_value: 50_000 })).toBe('Discount')
  })
})
