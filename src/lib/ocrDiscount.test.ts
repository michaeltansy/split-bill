import { describe, it, expect } from 'vitest'
import { sanitiseDiscount } from './ocrDiscount'

describe('sanitiseDiscount', () => {
  it('keeps a percentage discount', () => {
    expect(sanitiseDiscount('percentage', 15)).toEqual({ discount_type: 'percentage', discount_value: 15 })
  })

  it('keeps an amount discount and drops the sign', () => {
    expect(sanitiseDiscount('amount', -193_050)).toEqual({ discount_type: 'amount', discount_value: 193_050 })
  })

  it('treats an unknown type as percentage', () => {
    expect(sanitiseDiscount('fixed', 10)).toEqual({ discount_type: 'percentage', discount_value: 10 })
  })

  it('returns no discount for missing or non-numeric values', () => {
    expect(sanitiseDiscount(undefined, undefined)).toEqual({ discount_type: 'percentage', discount_value: 0 })
    expect(sanitiseDiscount('amount', 'abc')).toEqual({ discount_type: 'amount', discount_value: 0 })
  })

  it('returns no discount for a percentage above 100', () => {
    expect(sanitiseDiscount('percentage', 150)).toEqual({ discount_type: 'percentage', discount_value: 0 })
  })
})
