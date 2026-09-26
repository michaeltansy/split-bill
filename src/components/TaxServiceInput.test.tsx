import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaxServiceInput } from './TaxServiceInput'
import type { Session } from '@/types'

const session: Session = {
  id: 's1',
  created_at: '2024-01-01',
  expires_at: '2024-01-08',
  subtotal: 1_287_000,
  tax_amount: 117_053,
  service_amount: 76_577,
  grand_total: 1_480_630,
  tax_percentage: 9.1,
  service_percentage: 5.95,
  discount_type: 'percentage',
  discount_value: 0,
  discount_amount: 0,
  receipt_image_url: null,
  status: 'active',
  created_by: 'user-1',
}

describe('TaxServiceInput', () => {
  it('previews the discounted grand total and saves only the inputs', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<TaxServiceInput session={session} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '15' } })

    expect(screen.getByText('IDR 1.287.580')).toBeInTheDocument()
    expect(screen.getByText('−IDR 193.050')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledWith({
      subtotal: 1_287_000,
      tax_amount: 117_053,
      service_amount: 76_577,
      discount_type: 'percentage',
      discount_value: 15,
    })
  })

  it('disables saving while the discount is invalid', () => {
    render(<TaxServiceInput session={session} onUpdate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '120' } })

    expect(screen.getByText('Discount cannot exceed 100%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('shows the stored discount', () => {
    render(
      <TaxServiceInput
        session={{ ...session, discount_type: 'amount', discount_value: 50_000, discount_amount: 50_000 }}
        onUpdate={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Discount')).toHaveValue(50_000)
    expect(screen.getByRole('button', { name: 'IDR' })).toHaveAttribute('aria-pressed', 'true')
  })
})
