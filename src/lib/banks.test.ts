import { describe, it, expect } from 'vitest'
import { resolveBankLogo, resolveBankAccent, inferBankCode, BANK_OPTIONS } from './banks'

describe('resolveBankLogo', () => {
  it('returns the SVG path for curated banks', () => {
    expect(resolveBankLogo('BCA')).toBe('/banks/bca.svg')
    expect(resolveBankLogo('Jago')).toBe('/banks/jago.svg')
    expect(resolveBankLogo('GoPay')).toBe('/banks/gopay.svg')
  })

  it('is case-insensitive', () => {
    expect(resolveBankLogo('bca')).toBe('/banks/bca.svg')
    expect(resolveBankLogo('JAGO')).toBe('/banks/jago.svg')
    expect(resolveBankLogo('gopay')).toBe('/banks/gopay.svg')
  })

  it('returns null for unknown bank names', () => {
    expect(resolveBankLogo('Mandiri')).toBeNull()
    expect(resolveBankLogo('CIMB Niaga')).toBeNull()
  })

  it('returns null for null and undefined', () => {
    expect(resolveBankLogo(null)).toBeNull()
    expect(resolveBankLogo(undefined)).toBeNull()
  })

  it('returns null for the "Other" code (no stored logo)', () => {
    const other = BANK_OPTIONS.find((b) => b.code === 'Other')!
    // storedName is null for Other, so there is no curated entry to look up
    expect(resolveBankLogo(other.storedName)).toBeNull()
  })
})

describe('resolveBankAccent', () => {
  it('returns the brand accent colour for curated banks', () => {
    expect(resolveBankAccent('BCA')).toBe('#0060AF')
    expect(resolveBankAccent('Jago')).toBe('#FF6F2C')
    expect(resolveBankAccent('GoPay')).toBe('#00AED6')
  })

  it('is case-insensitive', () => {
    expect(resolveBankAccent('bca')).toBe('#0060AF')
  })

  it('returns the fallback grey for unknown bank names', () => {
    expect(resolveBankAccent('Mandiri')).toBe('#4A4A4A')
    expect(resolveBankAccent('')).toBe('#4A4A4A')
  })

  it('returns the fallback grey for null and undefined', () => {
    expect(resolveBankAccent(null)).toBe('#4A4A4A')
    expect(resolveBankAccent(undefined)).toBe('#4A4A4A')
  })
})

describe('inferBankCode', () => {
  it('returns the correct BankCode for each curated bank', () => {
    expect(inferBankCode('BCA')).toBe('BCA')
    expect(inferBankCode('Jago')).toBe('Jago')
    expect(inferBankCode('GoPay')).toBe('GoPay')
  })

  it('is case-insensitive', () => {
    expect(inferBankCode('bca')).toBe('BCA')
    expect(inferBankCode('GOPAY')).toBe('GoPay')
  })

  it('returns "Other" for unknown bank names', () => {
    expect(inferBankCode('Mandiri')).toBe('Other')
    expect(inferBankCode('Some random bank')).toBe('Other')
  })

  it('returns "Other" for null and undefined', () => {
    expect(inferBankCode(null)).toBe('Other')
    expect(inferBankCode(undefined)).toBe('Other')
  })
})
