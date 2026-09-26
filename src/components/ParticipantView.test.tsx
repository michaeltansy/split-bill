import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParticipantView } from './ParticipantView'
import type { Participant, ParticipantBill, Session } from '@/types'

const participant: Participant = {
  id: 'p1',
  session_id: 's1',
  name: 'Alice',
  created_at: '2024-01-01',
  is_paid: false,
  paid_at: null,
}

const baseSession: Session = {
  id: 's1',
  created_at: '2024-01-01',
  expires_at: '2024-01-08',
  subtotal: 200_000,
  tax_amount: 15_000,
  service_amount: 11_000,
  grand_total: 226_000,
  tax_percentage: 7.5,
  service_percentage: 5.5,
  discount_type: 'percentage',
  discount_value: 0,
  discount_amount: 0,
  receipt_image_url: null,
  status: 'active',
  created_by: 'user-1',
}

const bill: ParticipantBill = {
  participant,
  items: [],
  subtotal: 643_500,
  discount_share: 96_525,
  service_share: 38_288.5,
  tax_share: 58_526.5,
  total: 643_790,
}

function renderView(session: Session, b: ParticipantBill | null = null) {
  return render(
    <ParticipantView
      session={session}
      participant={participant}
      allParticipants={[participant]}
      items={[]}
      bill={b}
      bankAccount={null}
      onClaimItem={vi.fn()}
      onUpdateShare={vi.fn()}
      onMarkPaid={vi.fn()}
    />
  )
}

describe('ParticipantView receipt summary', () => {
  it('keeps fractional tax and service rates like 7,5% unchanged', () => {
    renderView(baseSession)
    expect(screen.getByText('Tax (7,5%)')).toBeInTheDocument()
    expect(screen.getByText('Service (5,5%)')).toBeInTheDocument()
    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
  })

  it('shows the session discount with its percentage', () => {
    renderView({ ...baseSession, discount_value: 15, discount_amount: 30_000, grand_total: 196_000 })
    expect(screen.getByText('Discount (15%)')).toBeInTheDocument()
    expect(screen.getByText('−IDR 30.000')).toBeInTheDocument()
  })

  it("shows the participant's discount share in My Bill", () => {
    renderView(baseSession, bill)
    expect(screen.getByText('Discount')).toBeInTheDocument()
    expect(screen.getByText('−IDR 96.525')).toBeInTheDocument()
  })
})
