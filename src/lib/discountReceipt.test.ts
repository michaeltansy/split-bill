// End-to-end check of the discount feature against the reference receipt
// (Yeok Jeon Grandma Beer, Gading Serpong): server totals -> per-person split
// -> Copy All text.
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { buildSessionMoney } from './sessionTotals'
import { calculateParticipantBills } from './calculations'
import { formatAllParticipantsText } from './bankTransferText'
import { useBillCalculation } from '@/hooks/useBillCalculation'
import type { ItemAssignment, ItemWithAssignments, Participant, Session } from '@/types'

const people: Participant[] = ['Ana', 'Budi', 'Cici'].map((name, i) => ({
  id: `p${i}`,
  session_id: 's1',
  name,
  created_at: '2026-09-25',
  is_paid: false,
  paid_at: null,
}))
const [ana, budi, cici] = people

let seq = 0
function assign(itemId: string, participant: Participant, unit_count: number | null = null): ItemAssignment {
  return {
    id: `a${seq++}`,
    item_id: itemId,
    session_id: 's1',
    participant_id: participant.id,
    split_type: unit_count === null ? 'equal' : 'unit',
    percentage: null,
    unit_count,
    created_at: '2026-09-25',
  }
}

function item(id: string, name: string, price: number, quantity: number, assignments: (id: string) => ItemAssignment[]): ItemWithAssignments {
  return { id, session_id: 's1', name, price, quantity, created_at: '2026-09-25', assignments: assignments(id) }
}

const everyone = (id: string) => people.map((p) => assign(id, p))

const items: ItemWithAssignments[] = [
  item('i1', 'BEER 500 ML', 59_000, 3, (id) => [assign(id, ana, 2), assign(id, budi, 1)]),
  item('i2', 'BEER 300 ML', 49_000, 1, (id) => [assign(id, cici)]),
  item('i3', 'SOY SAUCE CHICKEN', 118_000, 1, everyone),
  item('i4', 'CHEESE GAMJA JEON', 108_000, 1, everyone),
  item('i5', 'CHEESE RABOKKI COMBO', 148_000, 1, everyone),
  item('i6', 'ROSE TOKBOKKI', 138_000, 2, (id) => [assign(id, ana, 1), assign(id, budi, 1)]),
  item('i7', 'EXTRA RICE', 15_000, 3, (id) => people.map((p) => assign(id, p, 1))),
  item('i8', 'SEASONED FRIES', 80_000, 1, everyone),
  item('i9', 'WOOSAMGYUP BOKKEUM', 128_000, 1, everyone),
  item('i10', 'APPLE MINT HIGHBALL NON ALC', 40_000, 1, (id) => [assign(id, cici)]),
  item('i11', 'YANG NYUM CHICKEN', 118_000, 1, everyone),
]

function receiptSession(): Session {
  const money = buildSessionMoney({
    subtotal: 1_287_000,
    discount_type: 'percentage',
    discount_value: 15,
    service_amount: 76_577,
    tax_amount: 117_053,
  })
  if (!money.ok) throw new Error(money.error)
  return {
    id: 's1',
    created_at: '2026-09-25',
    expires_at: '2026-10-02',
    receipt_image_url: null,
    status: 'active',
    created_by: 'owner',
    ...money.values,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

describe('reference receipt, split across three people', () => {
  const session = receiptSession()
  const bills = calculateParticipantBills(session, items, people)

  it('stores the receipt totals', () => {
    expect(sum(items.map((i) => i.price * i.quantity))).toBe(1_287_000)
    expect(session).toMatchObject({
      discount_amount: 193_050,
      grand_total: 1_287_580,
      service_percentage: 7,
      tax_percentage: 10.7,
    })
  })

  it('splits every column exactly', () => {
    expect(round2(sum(bills.map((b) => b.subtotal)))).toBe(1_287_000)
    expect(round2(sum(bills.map((b) => b.discount_share)))).toBe(193_050)
    expect(round2(sum(bills.map((b) => b.service_share)))).toBe(76_577)
    expect(round2(sum(bills.map((b) => b.tax_share)))).toBe(117_053)
    expect(round2(sum(bills.map((b) => b.total)))).toBe(1_287_580)
  })

  it('gives each person a discount of 15% of their subtotal, to the cent', () => {
    for (const bill of bills) {
      expect(Math.abs(bill.discount_share - bill.subtotal * 0.15)).toBeLessThanOrEqual(0.01)
      for (const field of ['subtotal', 'discount_share', 'service_share', 'tax_share', 'total'] as const) {
        expect(bill[field]).toBe(round2(bill[field]))
      }
      expect(bill.total).toBe(
        round2(bill.subtotal - bill.discount_share + bill.service_share + bill.tax_share)
      )
    }
  })

  it('is valid once everything is assigned', () => {
    const { result } = renderHook(() => useBillCalculation(session, items, people))
    expect(result.current.totalUnassigned).toBe(0)
    expect(result.current.isValid).toBe(true)
  })

  it("copies every person's breakdown in Copy All", () => {
    const text = formatAllParticipantsText(bills, session.grand_total, null)
    expect(text).toContain('Grand Total: IDR 1.287.580')
    for (const bill of bills) {
      expect(text).toContain(`${bill.participant.name}: `)
    }
    expect(text.match(/Discount: −IDR/g)).toHaveLength(3)
    expect(text).toContain('    - BEER 500 ML')
    // Budi has no Beer 300 ML or highball.
    const budiBlock = text.split('\n\n').find((b) => b.includes('Budi:'))!
    expect(budiBlock).not.toContain('BEER 300 ML')
    expect(budiBlock).not.toContain('HIGHBALL')
  })
})

describe('sessions without a discount are unchanged', () => {
  it('keeps a 7.5% tax and totals as before', () => {
    const money = buildSessionMoney({ subtotal: 200_000, tax_amount: 15_000, service_amount: 10_000 })
    expect(money).toMatchObject({
      ok: true,
      values: { discount_amount: 0, grand_total: 225_000, tax_percentage: 7.5, service_percentage: 5 },
    })
  })
})
