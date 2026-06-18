import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { PATCH, DELETE } from './route'

const params = Promise.resolve({ id: 's1', itemId: 'i1' })

describe('PATCH /api/sessions/[id]/items/[itemId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 200 with the updated item', async () => {
    const updated = { id: 'i1', name: 'Salad', price: 35000 }
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: updated, error: null }) }) }) }),
    })
    const req = new NextRequest('http://localhost/api/sessions/s1/items/i1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Salad' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
  })

  it('returns 400 on DB error', async () => {
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'err' } }) }) }) }),
    })
    const req = new NextRequest('http://localhost/api/sessions/s1/items/i1', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const req = new NextRequest('http://localhost/api/sessions/s1/items/i1', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/sessions/[id]/items/[itemId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 204 on successful deletion', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    })
    const req = new NextRequest('http://localhost/api/sessions/s1/items/i1', { method: 'DELETE' })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(204)
  })

  it('returns 400 on DB error', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: { message: 'FK constraint' } }) }),
    })
    const req = new NextRequest('http://localhost/api/sessions/s1/items/i1', { method: 'DELETE' })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const req = new NextRequest('http://localhost/api/sessions/s1/items/i1', { method: 'DELETE' })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(500)
  })
})
