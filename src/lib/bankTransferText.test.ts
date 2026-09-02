import { describe, it, expect } from 'vitest'
import { formatTransferBlock, formatAllParticipantsText } from './bankTransferText'
import type { ParticipantBill, SessionBankAccount } from '@/types'

const mockBank: SessionBankAccount = {
  id: '1',
  session_id: 's1',
  bank_name: 'BCA',
  bank_account_number: '1234567890',
  bank_account_holder: 'John Doe',
  display_order: 0,
  created_at: '2024-01-01',
}

function makeBill(name: string, total: number): ParticipantBill {
  return {
    participant: { id: name, session_id: 's1', name, created_at: '2024-01-01', is_paid: false, paid_at: null },
    items: [],
    subtotal: total,
    tax_share: 0,
    service_share: 0,
    total,
  }
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

describe('formatAllParticipantsText', () => {
  const bills = [makeBill('Alice', 50000), makeBill('Bob', 30000)]

  it('includes every participant name and their total', () => {
    const result = formatAllParticipantsText(bills, 80000, null)
    expect(result).toContain('Alice')
    expect(result).toContain('Bob')
  })

  it('includes the grand total', () => {
    const result = formatAllParticipantsText(bills, 80000, null)
    expect(result).toContain('Grand Total')
  })

  it('does not include a transfer block when bank is null', () => {
    const result = formatAllParticipantsText(bills, 80000, null)
    expect(result).not.toContain('Transfer to:')
  })

  it('appends the bank transfer block at the end when a bank is provided', () => {
    const result = formatAllParticipantsText(bills, 80000, mockBank)
    expect(result.endsWith(formatTransferBlock(mockBank))).toBe(true)
    expect(result).toContain('Transfer to:')
    expect(result).toContain('BCA - 1234567890')
    expect(result).toContain('a/n John Doe')
  })

  it('lists participants before the grand total, and the grand total before the bank block', () => {
    const result = formatAllParticipantsText(bills, 80000, mockBank)
    const aliceIdx = result.indexOf('Alice')
    const grandTotalIdx = result.indexOf('Grand Total')
    const transferIdx = result.indexOf('Transfer to:')
    expect(aliceIdx).toBeLessThan(grandTotalIdx)
    expect(grandTotalIdx).toBeLessThan(transferIdx)
  })
})
