import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BillSummary } from './BillSummary'
import type { ParticipantBill, SessionBankAccount } from '@/types'

const mockWriteText = vi.fn()

beforeEach(() => {
  mockWriteText.mockReset()
  mockWriteText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const mockBank: SessionBankAccount = {
  id: 'bank-1',
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
    discount_share: 0,
    tax_share: 0,
    service_share: 0,
    total,
  }
}

describe('BillSummary Copy All', () => {
  const bills = [makeBill('Alice', 50000), makeBill('Bob', 30000)]

  it('copies every participant, the grand total, and the bank block on click', async () => {
    render(
      <BillSummary
        bills={bills}
        totalAssigned={80000}
        totalUnassigned={0}
        grandTotal={80000}
        bankAccount={mockBank}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy All' }))
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledTimes(1))

    const copiedText = mockWriteText.mock.calls[0][0] as string
    expect(copiedText).toContain('Alice: IDR 50.000')
    expect(copiedText).toContain('Bob: IDR 30.000')
    expect(copiedText).toContain('Grand Total: IDR 80.000')
    expect(copiedText).toContain('Transfer to:')
    expect(copiedText).toContain('BCA - 1234567890')
    expect(copiedText).toContain('a/n John Doe')
  })

  it('omits the transfer block when there is no bank account', async () => {
    render(
      <BillSummary
        bills={bills}
        totalAssigned={80000}
        totalUnassigned={0}
        grandTotal={80000}
        bankAccount={null}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy All' }))
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledTimes(1))

    expect(mockWriteText.mock.calls[0][0] as string).not.toContain('Transfer to:')
  })

  it('shows a "Copied!" confirmation after copying, then reverts after the timeout', async () => {
    vi.useFakeTimers()
    try {
      render(
        <BillSummary bills={bills} totalAssigned={80000} totalUnassigned={0} grandTotal={80000} bankAccount={null} />
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy All' }))
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(mockWriteText).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: '✓ Copied!' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2001)
      })

      expect(screen.getByRole('button', { name: 'Copy All' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not render the Copy All button when there are no bills', () => {
    render(<BillSummary bills={[]} totalAssigned={0} totalUnassigned={0} grandTotal={0} bankAccount={null} />)
    expect(screen.queryByRole('button', { name: 'Copy All' })).not.toBeInTheDocument()
  })
})

describe('BillSummary discount row', () => {
  const discounted: ParticipantBill = {
    ...makeBill('Alice', 643_790),
    subtotal: 643_500,
    discount_share: 96_525,
    service_share: 38_288.5,
    tax_share: 58_526.5,
  }

  it('shows the discount row when the participant has a discount share', () => {
    render(
      <BillSummary bills={[discounted]} totalAssigned={643_500} totalUnassigned={0} grandTotal={643_790} bankAccount={null} />
    )
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.getByText('Discount')).toBeInTheDocument()
    expect(screen.getByText('−IDR 96.525')).toBeInTheDocument()
  })

  it('hides the discount row when there is no discount', () => {
    render(
      <BillSummary bills={[makeBill('Bob', 30000)]} totalAssigned={30000} totalUnassigned={0} grandTotal={30000} bankAccount={null} />
    )
    fireEvent.click(screen.getByText('Bob'))
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
  })

  it('includes the discount in the copied bill text', async () => {
    render(
      <BillSummary bills={[discounted]} totalAssigned={643_500} totalUnassigned={0} grandTotal={643_790} bankAccount={null} />
    )
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Bill Details' }))

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledTimes(1))
    const text = mockWriteText.mock.calls[0][0] as string
    expect(text).toContain('Subtotal: IDR 643.500\n  Discount: −IDR 96.525\n  Tax:')
  })

  it('leaves the copied bill text unchanged without a discount', async () => {
    render(
      <BillSummary bills={[makeBill('Bob', 30000)]} totalAssigned={30000} totalUnassigned={0} grandTotal={30000} bankAccount={null} />
    )
    fireEvent.click(screen.getByText('Bob'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Bill Details' }))

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledTimes(1))
    expect(mockWriteText.mock.calls[0][0]).not.toContain('Discount')
  })
})
