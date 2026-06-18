import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { POST } from './route'

const params = Promise.resolve({ id: 's1' })

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions/s1/items', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/sessions/[id]/items', () => {
  beforeEach(() => vi.resetAllMocks())

  describe('bulk path (items array)', () => {
    it('inserts all items and returns 201', async () => {
      const created = [{ id: 'i1', name: 'Pizza' }, { id: 'i2', name: 'Salad' }]
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => Promise.resolve({ data: created, error: null }) }),
      })
      const res = await POST(makeRequest({ items: [{ name: 'Pizza', price: 50000 }, { name: 'Salad', price: 30000 }] }), { params })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual(created)
    })

    it('defaults quantity to 1 when not provided', async () => {
      let capturedInsert: unknown
      mockFrom.mockReturnValue({
        insert: (rows: unknown) => { capturedInsert = rows; return { select: () => Promise.resolve({ data: [], error: null }) } },
      })
      await POST(makeRequest({ items: [{ name: 'Soup', price: 15000 }] }), { params })
      expect((capturedInsert as { quantity: number }[])[0].quantity).toBe(1)
    })

    it('truncates item name to 255 characters', async () => {
      let capturedInsert: unknown
      mockFrom.mockReturnValue({
        insert: (rows: unknown) => { capturedInsert = rows; return { select: () => Promise.resolve({ data: [], error: null }) } },
      })
      await POST(makeRequest({ items: [{ name: 'A'.repeat(300), price: 10000 }] }), { params })
      expect((capturedInsert as { name: string }[])[0].name.length).toBe(255)
    })

    it('returns 400 on DB error', async () => {
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'DB err' } }) }),
      })
      const res = await POST(makeRequest({ items: [{ name: 'X', price: 1000 }] }), { params })
      expect(res.status).toBe(400)
    })
  })

  describe('single path', () => {
    it('inserts a single item and returns 201', async () => {
      const created = { id: 'i1', name: 'Burger', price: 60000, quantity: 1 }
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }) }),
      })
      const res = await POST(makeRequest({ name: 'Burger', price: 60000 }), { params })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual(created)
    })

    it('defaults quantity to 1', async () => {
      let capturedInsert: unknown
      mockFrom.mockReturnValue({
        insert: (data: unknown) => { capturedInsert = data; return { select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) } },
      })
      await POST(makeRequest({ name: 'Teh', price: 5000 }), { params })
      expect((capturedInsert as { quantity: number }).quantity).toBe(1)
    })

    it('returns 400 on DB error', async () => {
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'err' } }) }) }),
      })
      const res = await POST(makeRequest({ name: 'X', price: 1000 }), { params })
      expect(res.status).toBe(400)
    })
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const res = await POST(makeRequest({ name: 'X', price: 1 }), { params })
    expect(res.status).toBe(500)
  })
})
