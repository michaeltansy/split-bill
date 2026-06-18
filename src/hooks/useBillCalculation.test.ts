import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBillCalculation } from './useBillCalculation'
import type { Session, ItemWithAssignments, Participant } from '@/types'

const baseSession: Session = {
  id: 's1',
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
  created_by: 'user-1',
}

const participant: Participant = {
  id: 'p1',
  session_id: 's1',
  name: 'Alice',
  created_at: '2024-01-01',
  is_paid: false,
  paid_at: null,
}

function makeAssignment(overrides = {}) {
  return {
    id: 'a1',
    item_id: 'i1',
    session_id: 's1',
    participant_id: 'p1',
    split_type: 'equal' as const,
    percentage: 100,
    unit_count: null,
    created_at: '2024-01-01',
    ...overrides,
  }
}

describe('useBillCalculation', () => {
  it('returns empty defaults when session is null', () => {
    const { result } = renderHook(() => useBillCalculation(null, [], []))
    expect(result.current.bills).toEqual([])
    expect(result.current.totalAssigned).toBe(0)
    expect(result.current.totalUnassigned).toBe(0)
    expect(result.current.isValid).toBe(false)
  })

  it('returns zero totals for a valid session with no items', () => {
    const { result } = renderHook(() =>
      useBillCalculation(baseSession, [], [participant])
    )
    expect(result.current.totalAssigned).toBe(0)
    expect(result.current.totalUnassigned).toBe(0)
  })

  it('computes totalUnassigned for items with no assignments', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: 's1',
        name: 'Pizza',
        price: 50,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [],
      },
    ]
    const { result } = renderHook(() =>
      useBillCalculation(baseSession, items, [participant])
    )
    expect(result.current.totalUnassigned).toBe(50)
    expect(result.current.isValid).toBe(false)
  })

  it('isValid is true when all items are assigned and totals match grand_total', () => {
    // Alice pays the entire 100; with 10 tax + 5 service = 115 = grand_total
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: 's1',
        name: 'Dinner',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [makeAssignment()],
      },
    ]
    const { result } = renderHook(() =>
      useBillCalculation(baseSession, items, [participant])
    )
    expect(result.current.totalUnassigned).toBe(0)
    expect(result.current.isValid).toBe(true)
  })

  it('isValid is false when grand_total does not match the sum of bill totals', () => {
    const session = { ...baseSession, grand_total: 200 }
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: 's1',
        name: 'Dinner',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [makeAssignment()],
      },
    ]
    const { result } = renderHook(() =>
      useBillCalculation(session, items, [participant])
    )
    expect(result.current.isValid).toBe(false)
  })

  it('totalAssigned is rounded to 2 decimal places', () => {
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: 's1',
        name: 'Split item',
        price: 10,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [makeAssignment({ percentage: 33.33 })],
      },
    ]
    const { result } = renderHook(() =>
      useBillCalculation(baseSession, items, [participant])
    )
    expect(result.current.totalAssigned).toBe(
      Math.round(result.current.totalAssigned * 100) / 100
    )
  })

  it('totalUnassigned is never negative', () => {
    // All items assigned → totalUnassigned should be clamped at 0, not go negative
    const items: ItemWithAssignments[] = [
      {
        id: 'i1',
        session_id: 's1',
        name: 'Item',
        price: 100,
        quantity: 1,
        created_at: '2024-01-01',
        assignments: [makeAssignment()],
      },
    ]
    const { result } = renderHook(() =>
      useBillCalculation(baseSession, items, [participant])
    )
    expect(result.current.totalUnassigned).toBeGreaterThanOrEqual(0)
  })
})
