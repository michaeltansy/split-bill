import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { PATCH } from './route'

const params = Promise.resolve({ id: 'session-1' })

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions/session-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const storedRow = {
  subtotal: 1_287_000,
  tax_amount: 117_053,
  service_amount: 76_577,
  discount_type: 'percentage',
  discount_value: 0,
}

let lastUpdate: Record<string, unknown> | null

function setupSessions(current: object | null = storedRow) {
  lastUpdate = null
  mockFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve(
            current ? { data: current, error: null } : { data: null, error: { message: 'not found' } }
          ),
      }),
    }),
    update: (row: Record<string, unknown>) => {
      lastUpdate = row
      return {
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'session-1', ...row }, error: null }),
          }),
        }),
      }
    },
  }))
}

describe('PATCH /api/sessions/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('drops fields that are not editable', async () => {
    setupSessions()

    const res = await PATCH(
      makeRequest({ status: 'completed', created_by: 'attacker', expires_at: '2099-01-01', grand_total: 1 }),
      { params }
    )

    expect(res.status).toBe(200)
    expect(lastUpdate).toEqual({ status: 'completed' })
  })

  it('returns 400 when no editable fields are sent', async () => {
    setupSessions()

    const res = await PATCH(makeRequest({ created_by: 'attacker' }), { params })

    expect(res.status).toBe(400)
    expect(lastUpdate).toBeNull()
  })

  it('merges a discount change over the stored row and recomputes totals', async () => {
    setupSessions()

    const res = await PATCH(
      makeRequest({ discount_type: 'percentage', discount_value: 15, discount_amount: 1, grand_total: 1 }),
      { params }
    )

    expect(res.status).toBe(200)
    expect(lastUpdate).toMatchObject({
      subtotal: 1_287_000,
      tax_amount: 117_053,
      service_amount: 76_577,
      discount_value: 15,
      discount_amount: 193_050,
      grand_total: 1_287_580,
      tax_percentage: 10.7,
      service_percentage: 7,
    })
  })

  it('recomputes a percentage discount when only the subtotal changes, leaving tax and service as stored', async () => {
    setupSessions({ ...storedRow, discount_value: 10 })

    await PATCH(makeRequest({ subtotal: 1_000_000 }), { params })

    expect(lastUpdate).toMatchObject({
      subtotal: 1_000_000,
      discount_amount: 100_000,
      tax_amount: 117_053,
      service_amount: 76_577,
      grand_total: 1_000_000 - 100_000 + 76_577 + 117_053,
    })
  })

  it('rejects lowering the subtotal below a fixed discount', async () => {
    setupSessions({ ...storedRow, discount_type: 'amount', discount_value: 500_000 })

    const res = await PATCH(makeRequest({ subtotal: 400_000 }), { params })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_DISCOUNT')
    expect(lastUpdate).toBeNull()
  })

  it('returns 404 when the session does not exist', async () => {
    setupSessions(null)

    const res = await PATCH(makeRequest({ subtotal: 1 }), { params })

    expect(res.status).toBe(404)
  })
})
