import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { PATCH, DELETE } from './route'

const params = Promise.resolve({ id: 's1', participantId: 'p1' })

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions/s1/participants/p1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('PATCH /api/sessions/[id]/participants/[participantId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 400 when is_paid is not a boolean', async () => {
    const res = await PATCH(patchRequest({ is_paid: 'yes' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_INPUT')
  })

  it('returns 400 when is_paid is missing', async () => {
    const res = await PATCH(patchRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('updates to paid and returns 200', async () => {
    const updated = { id: 'p1', is_paid: true, paid_at: '2024-01-01T00:00:00.000Z' }
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: updated, error: null }) }) }) }),
    })
    const res = await PATCH(patchRequest({ is_paid: true }), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
  })

  it('passes paid_at=null to DB when is_paid is false', async () => {
    let capturedUpdate: unknown
    mockFrom.mockReturnValue({
      update: (data: unknown) => {
        capturedUpdate = data
        return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'p1' }, error: null }) }) }) }
      },
    })
    await PATCH(patchRequest({ is_paid: false }), { params })
    expect((capturedUpdate as { paid_at: unknown }).paid_at).toBeNull()
  })

  it('passes a non-null paid_at when is_paid is true', async () => {
    let capturedUpdate: unknown
    mockFrom.mockReturnValue({
      update: (data: unknown) => {
        capturedUpdate = data
        return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'p1' }, error: null }) }) }) }
      },
    })
    await PATCH(patchRequest({ is_paid: true }), { params })
    expect((capturedUpdate as { paid_at: unknown }).paid_at).not.toBeNull()
  })

  it('returns 400 on DB error', async () => {
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'err' } }) }) }) }),
    })
    const res = await PATCH(patchRequest({ is_paid: true }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const res = await PATCH(patchRequest({ is_paid: true }), { params })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/sessions/[id]/participants/[participantId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 204 on successful deletion', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    })
    const res = await DELETE(
      new NextRequest('http://localhost/api/sessions/s1/participants/p1', { method: 'DELETE' }),
      { params }
    )
    expect(res.status).toBe(204)
  })

  it('returns 400 on DB error', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: { message: 'Constraint' } }) }),
    })
    const res = await DELETE(
      new NextRequest('http://localhost/api/sessions/s1/participants/p1', { method: 'DELETE' }),
      { params }
    )
    expect(res.status).toBe(400)
  })
})
