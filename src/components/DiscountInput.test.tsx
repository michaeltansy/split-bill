import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscountInput } from './DiscountInput'

describe('DiscountInput', () => {
  it('shows the resolved amount for a percentage discount', () => {
    render(<DiscountInput type="percentage" value="15" resolvedAmount={193_050} onChange={() => {}} />)
    expect(screen.getByText('−IDR 193.050')).toBeInTheDocument()
  })

  it('does not show the hint for a fixed amount', () => {
    render(<DiscountInput type="amount" value="50000" resolvedAmount={50_000} onChange={() => {}} />)
    expect(screen.queryByText('−IDR 50.000')).not.toBeInTheDocument()
  })

  it('clears the value when switching type', () => {
    const onChange = vi.fn()
    render(<DiscountInput type="percentage" value="15" resolvedAmount={193_050} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'IDR' }))
    expect(onChange).toHaveBeenCalledWith('amount', '')
  })

  it('does not fire when clicking the selected type', () => {
    const onChange = vi.fn()
    render(<DiscountInput type="percentage" value="15" resolvedAmount={0} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '%' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('passes typed values through with the current type', () => {
    const onChange = vi.fn()
    render(<DiscountInput type="amount" value="" resolvedAmount={0} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '25000' } })
    expect(onChange).toHaveBeenCalledWith('amount', '25000')
  })

  it('shows an error instead of the hint', () => {
    render(
      <DiscountInput type="percentage" value="120" resolvedAmount={100} onChange={() => {}} error="Discount cannot exceed 100%" />
    )
    expect(screen.getByText('Discount cannot exceed 100%')).toBeInTheDocument()
    expect(screen.queryByText('−IDR 100')).not.toBeInTheDocument()
  })
})
