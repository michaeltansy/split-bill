import { describe, it, expect } from 'vitest'
import {
  allocateProportionally,
  calculateParticipantBills,
  calculatePercentages,
  computeSessionTotals,
  resolveDiscountAmount,
} from './calculations'
import type { Session, ItemWithAssignments, Participant } from '@/types'

describe('calculatePercentages', () => {
  it('should calculate service on the subtotal and tax on subtotal + service', () => {
    const result = calculatePercentages(100, 10.5, 5)
    expect(result.servicePercentage).toBe(5)
    expect(result.taxPercentage).toBe(10) // 10.5 / 105
  })

  it('should use the discounted subtotal as the base', () => {
    // Reference receipt: 1.287.000 − 15% (193.050), service 76.577, PB1 117.053
    const result = calculatePercentages(1_287_000, 117_053, 76_577, 193_050)
    expect(result.servicePercentage).toBe(7)
    expect(result.taxPercentage).toBe(10)
  })

  it('should return 0% when the discount consumes the whole subtotal', () => {
    const result = calculatePercentages(100, 10, 5, 100)
    expect(result.taxPercentage).toBe(0)
    expect(result.servicePercentage).toBe(0)
  })

  it('should handle zero subtotal', () => {
    const result = calculatePercentages(0, 10, 5)
    expect(result.taxPercentage).toBe(0)
    expect(result.servicePercentage).toBe(0)
  })

  it('should round to 2 decimal places', () => {
    const result = calculatePercentages(300, 10, 50)
    expect(result.servicePercentage).toBe(16.67) // 50 / 300
    expect(result.taxPercentage).toBe(2.86) // 10 / 350
  })
})

describe('resolveDiscountAmount', () => {
  it('should resolve a percentage of the subtotal', () => {
    expect(resolveDiscountAmount(1_287_000, 'percentage', 15)).toBe(193_050)
  })

  it('should round a percentage to whole rupiah', () => {
    // 15% of 1.287.001 = 193.050,15
    expect(resolveDiscountAmount(1_287_001, 'percentage', 15)).toBe(193_050)
    // 15% of 1.287.004 = 193.050,6
    expect(resolveDiscountAmount(1_287_004, 'percentage', 15)).toBe(193_051)
  })

  it('should pass a fixed amount through', () => {
    expect(resolveDiscountAmount(100_000, 'amount', 25_000)).toBe(25_000)
  })

  it('should clamp to the subtotal', () => {
    expect(resolveDiscountAmount(100_000, 'amount', 150_000)).toBe(100_000)
    expect(resolveDiscountAmount(100_000, 'percentage', 120)).toBe(100_000)
  })

  it('should return 0 for zero, negative or non-finite input', () => {
    expect(resolveDiscountAmount(100_000, 'percentage', 0)).toBe(0)
    expect(resolveDiscountAmount(100_000, 'amount', -5)).toBe(0)
    expect(resolveDiscountAmount(100_000, 'amount', NaN)).toBe(0)
    expect(resolveDiscountAmount(0, 'percentage', 15)).toBe(0)
  })
})

describe('computeSessionTotals', () => {
  it('should match the reference receipt', () => {
    const totals = computeSessionTotals({
      subtotal: 1_287_000,
      discount_type: 'percentage',
      discount_value: 15,
      service_amount: 76_577,
      tax_amount: 117_053,
    })
    expect(totals).toEqual({
      discount_amount: 193_050,
      grand_total: 1_287_580,
      service_percentage: 7,
      tax_percentage: 10,
    })
  })

  it('should leave totals unchanged with no discount', () => {
    const totals = computeSessionTotals({
      subtotal: 100_000,
      discount_type: 'percentage',
      discount_value: 0,
      service_amount: 5_000,
      tax_amount: 10_500,
    })
    expect(totals.discount_amount).toBe(0)
    expect(totals.grand_total).toBe(115_500)
  })

  it('should handle a 100% discount', () => {
    const totals = computeSessionTotals({
      subtotal: 100_000,
      discount_type: 'percentage',
      discount_value: 100,
      service_amount: 0,
      tax_amount: 0,
    })
    expect(totals.discount_amount).toBe(100_000)
    expect(totals.grand_total).toBe(0)
    expect(totals.tax_percentage).toBe(0)
    expect(totals.service_percentage).toBe(0)
  })
})

describe('allocateProportionally', () => {
  it('should split into integers that sum exactly to the total', () => {
    const parts = allocateProportionally(100, [1, 1, 1])
    expect(parts).toEqual([34, 33, 33])
  })

  it('should give leftover rupiah to the largest fractional parts', () => {
    // raw: 1.4, 3.5, 5.1 -> floors 1, 3, 5, one rupiah left for the .5
    expect(allocateProportionally(10, [14, 35, 51])).toEqual([1, 4, 5])
  })

  it('should break ties by larger weight, then lower index', () => {
    expect(allocateProportionally(1, [1, 1])).toEqual([1, 0])
    // 7 over [2, 2, 3] -> raw 2, 2, 3: no remainder
    expect(allocateProportionally(7, [2, 2, 3])).toEqual([2, 2, 3])
  })

  it('should return zeros when no weight is positive', () => {
    expect(allocateProportionally(100, [0, 0])).toEqual([0, 0])
    expect(allocateProportionally(100, [])).toEqual([])
  })

  it('should give nothing to zero weights', () => {
    expect(allocateProportionally(10, [0, 3])).toEqual([0, 10])
  })

  it('should round a fractional total first', () => {
    expect(allocateProportionally(10.4, [1, 1])).toEqual([5, 5])
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
    discount_type: 'percentage',
    discount_value: 0,
    discount_amount: 0,
    receipt_image_url: null,
    status: 'active',
    created_by: null,
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
    // Total subtotal = 100. Alice 75% -> 75% of tax(10)/service(5), in whole
    // rupiah: tax 7.5/2.5 -> 8/2 (tie -> larger weight), service 3.75/1.25 -> 4/1
    expect(alice.tax_share).toBe(8)
    expect(alice.service_share).toBe(4)
    expect(bob.tax_share).toBe(2)
    expect(bob.service_share).toBe(1)
    expect(alice.total + bob.total).toBe(mockSession.grand_total)
  })

  it('should allocate monetary fields in whole rupiah that sum exactly', () => {
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
    const bob = bills.find(b => b.participant.name === 'Bob')!
    // 3.333 / 6.667 of 10 -> 3 / 7
    expect(alice.subtotal).toBe(3)
    expect(bob.subtotal).toBe(7)
    // Per-item shares keep their exact value for display.
    expect(alice.items[0].share_amount).toBeCloseTo(3.333, 3)
    for (const bill of bills) {
      for (const field of ['subtotal', 'discount_share', 'service_share', 'tax_share', 'total'] as const) {
        expect(Number.isInteger(bill[field])).toBe(true)
      }
    }
  })

  it('should split an odd amount three ways exactly', () => {
    const session: Session = { ...mockSession, subtotal: 100_000, tax_amount: 10_001, service_amount: 5_002, grand_total: 115_003 }
    const participants: Participant[] = [
      ...mockParticipants,
      { id: 'p3', session_id: '1', name: 'Cara', created_at: '2024-01-01' } as Participant,
    ]
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Platter',
        price: 100_000,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: ['p1', 'p2', 'p3'].map((pid, n) => (
          { id: `a${n}`, item_id: 'i1', participant_id: pid, split_type: 'equal' as const, percentage: null, unit_count: null, created_at: '2024-01-01' }
        )),
      },
    ]

    const bills = calculateParticipantBills(session, items, participants)

    expect(bills.map(b => b.subtotal)).toEqual([33_334, 33_333, 33_333])
    expect(bills.reduce((s, b) => s + b.total, 0)).toBe(115_003)
  })

  it('should distribute the discount proportionally (reference receipt, 2 people)', () => {
    const session: Session = {
      ...mockSession,
      subtotal: 1_287_000,
      discount_type: 'percentage',
      discount_value: 15,
      discount_amount: 193_050,
      service_amount: 76_577,
      tax_amount: 117_053,
      grand_total: 1_287_580,
    }
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Everything',
        price: 1_287_000,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01' },
          { id: 'a2', item_id: 'i1', participant_id: 'p2', split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01' },
        ],
      },
    ]

    const [alice, bob] = calculateParticipantBills(session, items, mockParticipants)

    expect(alice).toMatchObject({ subtotal: 643_500, discount_share: 96_525, service_share: 38_289, tax_share: 58_527, total: 643_791 })
    expect(bob).toMatchObject({ subtotal: 643_500, discount_share: 96_525, service_share: 38_288, tax_share: 58_526, total: 643_789 })
    expect(alice.total + bob.total).toBe(1_287_580)
  })

  it('should give a participant with no items no discount', () => {
    const session: Session = { ...mockSession, discount_amount: 20, grand_total: 95 }
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: '1',
        name: 'Solo',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [
          { id: 'a1', item_id: 'i1', participant_id: 'p1', split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01' },
        ],
      },
    ]

    const [alice, bob] = calculateParticipantBills(session, items, mockParticipants)

    expect(alice.discount_share).toBe(20)
    expect(alice.total).toBe(95)
    expect(bob.discount_share).toBe(0)
    expect(bob.total).toBe(0)
  })
})
