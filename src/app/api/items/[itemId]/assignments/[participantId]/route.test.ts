import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

import { POST, DELETE } from './route'

const params = Promise.resolve({ itemId: 'i1', participantId: 'p1' })

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/items/i1/assignments/p1', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function setupAuth({
  item = { session_id: 's1', quantity: 4 } as object | null,
  participant = { id: 'p1', session_id: 's1' } as object | null,
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'items') return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: item, error: null }) }) }),
    }
    if (table === 'participants') return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: participant, error: null }) }) }),
    }
    if (table === 'item_assignments') return {
      upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'a1' }, error: null }) }) }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }
  })
}

describe('POST /api/items/[itemId]/assignments/[participantId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 400 for an invalid split_type', async () => {
    const res = await POST(postRequest({ split_type: 'random' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_SPLIT_TYPE')
  })

  it('returns 400 when split_type is missing', async () => {
    const res = await POST(postRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the item does not exist', async () => {
    setupAuth({ item: null })
    const res = await POST(postRequest({ split_type: 'equal' }), { params })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('ITEM_NOT_FOUND')
  })

  it('returns 403 when the participant is in a different session', async () => {
    setupAuth({ participant: { id: 'p1', session_id: 'DIFFERENT' } })
    const res = await POST(postRequest({ split_type: 'equal' }), { params })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('PARTICIPANT_NOT_IN_SESSION')
  })

  describe('equal split', () => {
    it('returns 200 and upserts the assignment directly (no RPC)', async () => {
      setupAuth()
      const res = await POST(postRequest({ split_type: 'equal' }), { params })
      expect(res.status).toBe(200)
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  describe('percentage split', () => {
    it('returns 400 for percentage ≤ 0', async () => {
      setupAuth()
      const res = await POST(postRequest({ split_type: 'percentage', percentage: 0 }), { params })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('INVALID_PERCENTAGE')
    })

    it('returns 400 for percentage > 100', async () => {
      setupAuth()
      const res = await POST(postRequest({ split_type: 'percentage', percentage: 101 }), { params })
      expect(res.status).toBe(400)
    })

    it('calls RPC and returns 200 for a valid percentage', async () => {
      setupAuth()
      mockRpc.mockResolvedValue({ data: { id: 'a1' }, error: null })
      const res = await POST(postRequest({ split_type: 'percentage', percentage: 60 }), { params })
      expect(res.status).toBe(200)
      expect(mockRpc).toHaveBeenCalledWith('upsert_assignment_validated', expect.objectContaining({
        p_split_type: 'percentage',
        p_percentage: 60,
      }))
    })
  })

  describe('unit split', () => {
    it('returns 400 for unit_count ≤ 0', async () => {
      setupAuth()
      const res = await POST(postRequest({ split_type: 'unit', unit_count: 0 }), { params })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('INVALID_UNIT_COUNT')
    })

    it('calls RPC and returns 200 for a valid unit_count', async () => {
      setupAuth()
      mockRpc.mockResolvedValue({ data: { id: 'a1' }, error: null })
      const res = await POST(postRequest({ split_type: 'unit', unit_count: 2 }), { params })
      expect(res.status).toBe(200)
      expect(mockRpc).toHaveBeenCalledWith('upsert_assignment_validated', expect.objectContaining({
        p_split_type: 'unit',
        p_unit_count: 2,
      }))
    })
  })

  describe('RPC error mapping', () => {
    it.each([
      ['INVALID_PERCENTAGE_SUM', 'INVALID_PERCENTAGE', 400],
      ['INVALID_UNIT_SUM:3:4', 'INVALID_UNIT_SUM', 400],
      ['INVALID_UNIT_COUNT', 'INVALID_UNIT_COUNT', 400],
      ['INVALID_SPLIT_TYPE', 'INVALID_SPLIT_TYPE', 400],
      ['ITEM_NOT_FOUND', 'ITEM_NOT_FOUND', 404],
    ])('maps "%s" to code "%s" with status %d', async (rpcMsg, code, status) => {
      setupAuth()
      mockRpc.mockResolvedValue({ data: null, error: { message: rpcMsg } })
      const res = await POST(postRequest({ split_type: 'percentage', percentage: 60 }), { params })
      expect(res.status).toBe(status)
      expect((await res.json()).code).toBe(code)
    })
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const res = await POST(postRequest({ split_type: 'equal' }), { params })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/items/[itemId]/assignments/[participantId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 200 when the assignment is deleted', async () => {
    setupAuth()
    const res = await DELETE(
      new NextRequest('http://localhost/api/items/i1/assignments/p1', { method: 'DELETE' }),
      { params }
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 when the item does not exist', async () => {
    setupAuth({ item: null })
    const res = await DELETE(
      new NextRequest('http://localhost/api/items/i1/assignments/p1', { method: 'DELETE' }),
      { params }
    )
    expect(res.status).toBe(404)
  })

  it('returns 403 when the participant is in a different session', async () => {
    setupAuth({ participant: { id: 'p1', session_id: 'WRONG' } })
    const res = await DELETE(
      new NextRequest('http://localhost/api/items/i1/assignments/p1', { method: 'DELETE' }),
      { params }
    )
    expect(res.status).toBe(403)
  })
})
