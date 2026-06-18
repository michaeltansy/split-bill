import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

import { PUT } from './route'

const params = Promise.resolve({ itemId: 'i1' })

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/items/i1/assignments', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function setupItem(item: object | null = { session_id: 's1', quantity: 4 }) {
  mockFrom.mockReturnValue({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: item, error: item ? null : { message: 'Not found' } }) }) }),
  })
}

describe('PUT /api/items/[itemId]/assignments', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 404 when the item does not exist', async () => {
    setupItem(null)
    const res = await PUT(makeRequest({ assignments: [] }), { params })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('ITEM_NOT_FOUND')
  })

  describe('percentage split validation', () => {
    it('returns 400 when percentages do not sum to 100', async () => {
      setupItem()
      const res = await PUT(makeRequest({
        assignments: [
          { participant_id: 'p1', split_type: 'percentage', percentage: 40 },
          { participant_id: 'p2', split_type: 'percentage', percentage: 40 },
        ],
      }), { params })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('INVALID_PERCENTAGE')
    })

    it('accepts percentages that sum to 100', async () => {
      setupItem()
      mockRpc.mockResolvedValue({ data: [], error: null })
      const res = await PUT(makeRequest({
        assignments: [
          { participant_id: 'p1', split_type: 'percentage', percentage: 60 },
          { participant_id: 'p2', split_type: 'percentage', percentage: 40 },
        ],
      }), { params })
      expect(res.status).toBe(200)
    })
  })

  describe('unit split validation', () => {
    it('returns 400 when a unit_count is 0 or negative', async () => {
      setupItem({ session_id: 's1', quantity: 4 })
      const res = await PUT(makeRequest({
        assignments: [
          { participant_id: 'p1', split_type: 'unit', unit_count: 0 },
        ],
      }), { params })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('INVALID_UNIT_COUNT')
    })

    it('returns 400 when unit counts do not sum to item quantity', async () => {
      setupItem({ session_id: 's1', quantity: 4 })
      const res = await PUT(makeRequest({
        assignments: [
          { participant_id: 'p1', split_type: 'unit', unit_count: 1 },
          { participant_id: 'p2', split_type: 'unit', unit_count: 2 },
        ],
      }), { params })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('INVALID_UNIT_SUM')
    })

    it('accepts unit counts that sum to item quantity', async () => {
      setupItem({ session_id: 's1', quantity: 4 })
      mockRpc.mockResolvedValue({ data: [], error: null })
      const res = await PUT(makeRequest({
        assignments: [
          { participant_id: 'p1', split_type: 'unit', unit_count: 3 },
          { participant_id: 'p2', split_type: 'unit', unit_count: 1 },
        ],
      }), { params })
      expect(res.status).toBe(200)
    })
  })

  describe('RPC error mapping', () => {
    it.each([
      ['INVALID_PERCENTAGE_SUM', 'INVALID_PERCENTAGE', 400],
      ['INVALID_UNIT_SUM:3:4', 'INVALID_UNIT_SUM', 400],
      ['ITEM_NOT_FOUND', 'ITEM_NOT_FOUND', 404],
    ])('maps RPC error "%s" to code "%s" and status %d', async (rpcMsg, code, status) => {
      setupItem()
      mockRpc.mockResolvedValue({ data: null, error: { message: rpcMsg } })
      const res = await PUT(makeRequest({ assignments: [{ participant_id: 'p1', split_type: 'equal' }] }), { params })
      expect(res.status).toBe(status)
      expect((await res.json()).code).toBe(code)
    })

    it('returns 400 for unmapped RPC errors', async () => {
      setupItem()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'some db error' } })
      const res = await PUT(makeRequest({ assignments: [{ participant_id: 'p1', split_type: 'equal' }] }), { params })
      expect(res.status).toBe(400)
    })
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const res = await PUT(makeRequest({ assignments: [] }), { params })
    expect(res.status).toBe(500)
  })
})
