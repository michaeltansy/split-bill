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

  it('should calculate unit-based splits correctly', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Skewers',
        price: 10, // per-unit price
        quantity: 5,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'unit', percentage: null, unit_count: 3, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'unit', percentage: null, unit_count: 2, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    // p1 took 3 of 5 units at 10 each = 30 (60%), p2 took 2 = 20 (40%)
    const alice = bills.find(b => b.participant.name === 'Alice')!
    const bob = bills.find(b => b.participant.name === 'Bob')!
    expect(alice.subtotal).toBe(30)
    expect(alice.items[0].share_percentage).toBe(60)
    expect(alice.items[0].unit_count).toBe(3)
    expect(bob.subtotal).toBe(20)
    expect(bob.items[0].share_percentage).toBe(40)
  })

  it('should fall back to an equal split when unit_count is null', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Fries',
        price: 30,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'unit', percentage: null, unit_count: null, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'unit', percentage: null, unit_count: null, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    expect(bills[0].subtotal).toBe(15)
    expect(bills[1].subtotal).toBe(15)
  })

  it('should skip items with no assignments', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Unclaimed dish',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    expect(bills[0].total).toBe(0)
    expect(bills[1].total).toBe(0)
  })

  it('should record who an item is shared with', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Cake',
        price: 40,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    const alice = bills.find(b => b.participant.name === 'Alice')!
    expect(alice.items[0].shared_with).toEqual(['Bob'])
  })

  it('should ignore assignments referencing unknown participants', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Soup',
        price: 50,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'ghost', split_type: 'equal', percentage: 50, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    // The split is still over 2 assignments, so Alice pays for her half only.
    const alice = bills.find(b => b.participant.name === 'Alice')!
    const bob = bills.find(b => b.participant.name === 'Bob')!
    expect(alice.subtotal).toBe(25)
    expect(bob.subtotal).toBe(0)
  })

  it('should distribute tax and service proportionally to subtotals', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Expensive',
        price: 75,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: 100, created_at: '2024-01-01' },
        ],
      },
      {
        id: 'i2',
        session_id: '1',
        name: 'Cheap',
        price: 25,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a2', item_id: 'i2', participant_id: 'p2', split_type: 'equal', percentage: 100, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    const alice = bills.find(b => b.participant.name === 'Alice')!
    const bob = bills.find(b => b.participant.name === 'Bob')!
    // Total subtotal = 100. Alice 75% -> 75% of tax(10)/service(5)
    expect(alice.tax_share).toBe(7.5)
    expect(alice.service_share).toBe(3.75)
    expect(bob.tax_share).toBe(2.5)
    expect(bob.service_share).toBe(1.25)
  })

  it('should round monetary fields to 2 decimal places', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Thirds',
        price: 10,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'percentage', percentage: 33.33, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'percentage', percentage: 66.67, created_at: '2024-01-01' },
        ],
      },
    ]

    const bills = calculateParticipantBills(mockSession, items, mockParticipants)

    const alice = bills.find(b => b.participant.name === 'Alice')!
    // 33.33% of 10 = 3.333 -> rounded to 3.33
    expect(alice.subtotal).toBe(3.33)
    // Every monetary field should have at most 2 decimal places.
    for (const bill of bills) {
      expect(bill.subtotal).toBe(Math.round(bill.subtotal * 100) / 100)
      expect(bill.total).toBe(Math.round(bill.total * 100) / 100)
    }
  })
})
