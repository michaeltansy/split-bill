import { describe, it, expect } from 'vitest'
import { formatTransferBlock } from './bankTransferText'
import type { SessionBankAccount } from '@/types'

const mockBank: SessionBankAccount = {
  id: '1',
  session_id: 's1',
  bank_name: 'BCA',
  bank_account_number: '1234567890',
  bank_account_holder: 'John Doe',
  display_order: 0,
  created_at: '2024-01-01',
}

describe('formatTransferBlock', () => {
  it('returns an empty string when bank is null', () => {
    expect(formatTransferBlock(null)).toBe('')
  })

  it('includes the bank name and account number', () => {
    const result = formatTransferBlock(mockBank)
    expect(result).toContain('BCA - 1234567890')
  })

  it('includes the account holder with "a/n" prefix', () => {
    const result = formatTransferBlock(mockBank)
    expect(result).toContain('a/n John Doe')
  })

  it('includes the "Transfer to:" heading', () => {
    const result = formatTransferBlock(mockBank)
    expect(result).toContain('Transfer to:')
  })

  it('starts with a newline so it can be appended to a bill block without a separator check', () => {
    const result = formatTransferBlock(mockBank)
    expect(result.startsWith('\n')).toBe(true)
  })

  it('empty string allows safe template literal concatenation when bank is null', () => {
    const billText = 'Total: IDR 50.000'
    const block = `${billText}${formatTransferBlock(null)}`
    expect(block).toBe('Total: IDR 50.000')
  })
})
