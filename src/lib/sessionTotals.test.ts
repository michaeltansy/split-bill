import { describe, it, expect } from 'vitest'
import { buildSessionMoney } from './sessionTotals'

describe('buildSessionMoney', () => {
  it('derives totals for the reference receipt', () => {
    const result = buildSessionMoney({
      subtotal: 1_287_000,
      tax_amount: 117_053,
      service_amount: 76_577,
      discount_type: 'percentage',
      discount_value: 15,
    })
    expect(result).toEqual({
      ok: true,
      values: {
        subtotal: 1_287_000,
        tax_amount: 117_053,
        service_amount: 76_577,
        discount_type: 'percentage',
        discount_value: 15,
        discount_amount: 193_050,
        grand_total: 1_287_580,
        tax_percentage: 10.7,
        service_percentage: 7,
      },
    })
  })

  it('defaults missing fields to zero and no discount', () => {
    const result = buildSessionMoney({})
    expect(result).toMatchObject({
      ok: true,
      values: { subtotal: 0, discount_type: 'percentage', discount_value: 0, discount_amount: 0, grand_total: 0 },
    })
  })

  it('keeps an unchanged no-discount calculation', () => {
    const result = buildSessionMoney({ subtotal: 200_000, tax_amount: 15_000, service_amount: 11_000 })
    expect(result).toMatchObject({
      ok: true,
      values: { grand_total: 226_000, tax_percentage: 7.5, service_percentage: 5.5 },
    })
  })

  it('rejects negative or non-numeric amounts', () => {
    expect(buildSessionMoney({ subtotal: -1 })).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(buildSessionMoney({ tax_amount: 'abc' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
  })

  it('rejects an invalid discount', () => {
    expect(
      buildSessionMoney({ subtotal: 100, discount_type: 'amount', discount_value: 101 })
    ).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT', error: 'Discount cannot exceed the subtotal' })
    expect(
      buildSessionMoney({ subtotal: 100, discount_type: 'bogus', discount_value: 1 })
    ).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' })
  })
})
