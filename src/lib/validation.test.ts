import { describe, it, expect } from 'vitest'
import {
  validateParticipantName,
  validateItemName,
  validatePrice,
  validateQuantity,
  validatePercentage,
  validatePercentageSum,
} from './validation'

describe('validateParticipantName', () => {
  it('should reject empty names', () => {
    expect(validateParticipantName('')).toEqual({
      isValid: false,
      error: 'Name is required',
    })
  })

  it('should reject whitespace-only names', () => {
    expect(validateParticipantName('   ')).toEqual({
      isValid: false,
      error: 'Name is required',
    })
  })

  it('should accept valid names', () => {
    expect(validateParticipantName('John')).toEqual({ isValid: true })
  })

  it('should reject duplicate names (case-insensitive)', () => {
    expect(validateParticipantName('John', ['john', 'jane'])).toEqual({
      isValid: false,
      error: 'A participant with this name already exists',
    })
  })

  it('should reject names over 50 characters', () => {
    const longName = 'a'.repeat(51)
    expect(validateParticipantName(longName)).toEqual({
      isValid: false,
      error: 'Name must be less than 50 characters',
    })
  })
})

describe('validateItemName', () => {
  it('should reject empty names', () => {
    expect(validateItemName('')).toEqual({
      isValid: false,
      error: 'Item name is required',
    })
  })

  it('should accept valid names', () => {
    expect(validateItemName('Pizza')).toEqual({ isValid: true })
  })

  it('should reject names over 100 characters', () => {
    const longName = 'a'.repeat(101)
    expect(validateItemName(longName)).toEqual({
      isValid: false,
      error: 'Item name must be less than 100 characters',
    })
  })
})

describe('validatePrice', () => {
  it('should reject NaN', () => {
    expect(validatePrice('abc')).toEqual({
      isValid: false,
      error: 'Price must be a valid number',
    })
  })

  it('should reject negative prices', () => {
    expect(validatePrice(-10)).toEqual({
      isValid: false,
      error: 'Price cannot be negative',
    })
  })

  it('should accept valid prices', () => {
    expect(validatePrice(12.99)).toEqual({ isValid: true })
    expect(validatePrice('25.50')).toEqual({ isValid: true })
    expect(validatePrice(0)).toEqual({ isValid: true })
  })

  it('should reject extremely large prices', () => {
    expect(validatePrice(1000000)).toEqual({
      isValid: false,
      error: 'Price is too large',
    })
  })
})

describe('validateQuantity', () => {
  it('should reject non-integer quantities', () => {
    expect(validateQuantity(1.5)).toEqual({
      isValid: false,
      error: 'Quantity must be a whole number',
    })
  })

  it('should reject quantities less than 1', () => {
    expect(validateQuantity(0)).toEqual({
      isValid: false,
      error: 'Quantity must be at least 1',
    })
  })

  it('should accept valid quantities', () => {
    expect(validateQuantity(1)).toEqual({ isValid: true })
    expect(validateQuantity(10)).toEqual({ isValid: true })
    expect(validateQuantity('5')).toEqual({ isValid: true })
  })
})

describe('validatePercentage', () => {
  it('should reject negative percentages', () => {
    expect(validatePercentage(-10)).toEqual({
      isValid: false,
      error: 'Percentage cannot be negative',
    })
  })

  it('should reject percentages over 100', () => {
    expect(validatePercentage(150)).toEqual({
      isValid: false,
      error: 'Percentage cannot exceed 100%',
    })
  })

  it('should accept valid percentages', () => {
    expect(validatePercentage(0)).toEqual({ isValid: true })
    expect(validatePercentage(50)).toEqual({ isValid: true })
    expect(validatePercentage(100)).toEqual({ isValid: true })
  })
})

describe('validatePercentageSum', () => {
  it('should accept percentages that sum to 100', () => {
    expect(validatePercentageSum([50, 50])).toEqual({ isValid: true })
    expect(validatePercentageSum([33.33, 33.33, 33.34])).toEqual({ isValid: true })
    expect(validatePercentageSum([100])).toEqual({ isValid: true })
  })

  it('should reject percentages that do not sum to 100', () => {
    const result = validatePercentageSum([40, 40])
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('80.0%')
  })
})
