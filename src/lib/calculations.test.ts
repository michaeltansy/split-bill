import { describe, it, expect } from 'vitest'
import { calculateParticipantBills, calculatePercentages } from './calculations'
import type { Session, ItemWithAssignments, Participant } from '@/types'

describe('calculatePercentages', () => {
  it('should calculate tax percentage correctly', () => {
    const result = calculatePercentages(100, 10, 5)
    expect(result.taxPercentage).toBe(10)
    expect(result.servicePercentage).toBe(5)
  })

  it('should handle zero subtotal', () => {
    const result = calculatePercentages(0, 10, 5)
    expect(result.taxPercentage).toBe(0)
    expect(result.servicePercentage).toBe(0)
  })

  it('should round to 2 decimal places', () => {
    const result = calculatePercentages(100, 33.333, 16.666)
    expect(result.taxPercentage).toBeCloseTo(33.33, 2)
    expect(result.servicePercentage).toBeCloseTo(16.67, 2)
  })
})

describe('calculateParticipantBills', () => {
  const mockSession: Session = {
    id: '1',
    created_at: '2024-01-01',
    expires_at: '2024-01-08',
    subtotal: 100,
    tax_amount: 10,
    service_amount: 5,
    grand_total: 115,
    tax_percentage: 10,
    service_percentage: 5,
    receipt_image_url: null,
    status: 'active',
  }

  const mockParticipants: Participant[] = [
    { id: 'p1', session_id: '1', name: 'Alice', created_at: '2024-01-01' },
    { id: 'p2', session_id: '1', name: 'Bob', created_at: '2024-01-01' },
  ]

  it('should return empty array when no participants', () => {
    const bills = calculateParticipantBills(mockSession, [], [])
    expect(bills).toEqual([])
  })

  it('should return bills for all participants even without items', () => {
    const bills = calculateParticipantBills(mockSession, [], mockParticipants)
    expect(bills).toHaveLength(2)
    expect(bills[0].participant.name).toBe('Alice')
    expect(bills[1].participant.name).toBe('Bob')
    expect(bills[0].total).toBe(0)
    expect(bills[1].total).toBe(0)
  })

  it('should calculate equal split correctly', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Pizza',
        price: 50,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    expect(bills).toHaveLength(2)
    expect(bills[0].subtotal).toBe(25) // 50% of 50
    expect(bills[1].subtotal).toBe(25)
  })

  it('should calculate percentage split correctly', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Steak',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'percentage', percentage: 70, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'percentage', percentage: 30, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    expect(bills[0].subtotal).toBe(70) // 70% of 100
    expect(bills[1].subtotal).toBe(30) // 30% of 100
  })

  it('should include tax and service proportionally', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Dinner',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: 100, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    const aliceBill = bills.find(b => b.participant.name === 'Alice')!
    expect(aliceBill.subtotal).toBe(100)
    expect(aliceBill.tax_share).toBe(10) // 10% of 100
    expect(aliceBill.service_share).toBe(5) // 5% of 100
    expect(aliceBill.total).toBe(115)
  })

  it('should handle items with quantity > 1', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Drinks',
        price: 5,
        quantity: 4,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    // Total is 5 * 4 = 20, each gets 10
    expect(bills[0].subtotal).toBe(10)
    expect(bills[1].subtotal).toBe(10)
  })
})
