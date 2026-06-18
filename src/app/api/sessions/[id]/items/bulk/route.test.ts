import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { POST } from './route'

const params = Promise.resolve({ id: 's1' })

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions/s1/items/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function setupSession(exists = true) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'sessions') return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: exists ? { id: 's1' } : null, error: exists ? null : { message: 'Not found' } }) }) }),
    }
    if (table === 'items') return {
      insert: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    }
  })
}

describe('POST /api/sessions/[id]/items/bulk', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 400 when items is not an array', async () => {
    const res = await POST(makeRequest({ items: 'bad' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_INPUT')
  })

  it('returns 400 when items array is empty', async () => {
    const res = await POST(makeRequest({ items: [] }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 404 when session does not exist', async () => {
    setupSession(false)
    const res = await POST(makeRequest({ items: [{ name: 'X', price: 1000 }] }), { params })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NOT_FOUND')
  })

  it('returns 500 when an item has no name', async () => {
    setupSession()
    const res = await POST(makeRequest({ items: [{ price: 1000 }] }), { params })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('name')
  })

  it('returns 500 when an item has a negative price', async () => {
    setupSession()
    const res = await POST(makeRequest({ items: [{ name: 'X', price: -1 }] }), { params })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('price')
  })

  it('inserts valid items and returns 201', async () => {
    const created = [{ id: 'i1', name: 'Pizza', price: 50000, quantity: 2 }]
    setupSession()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1' }, error: null }) }) }),
      }
      if (table === 'items') return {
        insert: () => ({ select: () => Promise.resolve({ data: created, error: null }) }),
      }
    })
    const res = await POST(makeRequest({ items: [{ name: 'Pizza', price: 50000, quantity: 2 }] }), { params })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)
  })

  it('defaults quantity to 1 when quantity is 0 or missing', async () => {
    let capturedInsert: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1' }, error: null }) }) }),
      }
      if (table === 'items') return {
        insert: (rows: unknown) => { capturedInsert = rows; return { select: () => Promise.resolve({ data: [], error: null }) } },
      }
    })
    await POST(makeRequest({ items: [{ name: 'Tea', price: 5000, quantity: 0 }] }), { params })
    expect((capturedInsert as { quantity: number }[])[0].quantity).toBe(1)
  })
})
