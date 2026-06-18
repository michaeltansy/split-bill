import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions/s1/participants', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const params = Promise.resolve({ id: 's1' })

describe('POST /api/sessions/[id]/participants', () => {
  beforeEach(() => vi.resetAllMocks())

  describe('bulk path (names array)', () => {
    it('creates all valid names and returns 201', async () => {
      const created = [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }]
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => Promise.resolve({ data: created, error: null }) }),
      })
      const res = await POST(makeRequest({ names: ['Alice', 'Bob'] }), { params })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual(created)
    })

    it('filters out non-string and blank entries before inserting', async () => {
      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({ select: () => Promise.resolve({ data: [{ id: 'p1', name: 'Alice' }], error: null }) }),
      })
      await POST(makeRequest({ names: [42, '', '  ', 'Alice'] }), { params })
      const insertSpy = mockFrom.mock.results[0].value.insert
      const rows = insertSpy.mock.calls[0][0]
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe('Alice')
    })

    it('returns 400 when names array contains no valid entries', async () => {
      const res = await POST(makeRequest({ names: ['', '   '] }), { params })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('INVALID_INPUT')
    })

    it('returns 409 for duplicate participant (PG unique violation 23505)', async () => {
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }),
      })
      const res = await POST(makeRequest({ names: ['Alice'] }), { params })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe('PARTICIPANT_EXISTS')
    })

    it('returns 400 on other DB errors', async () => {
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => Promise.resolve({ data: null, error: { code: '99999', message: 'some error' } }) }),
      })
      const res = await POST(makeRequest({ names: ['Alice'] }), { params })
      expect(res.status).toBe(400)
    })
  })

  describe('single path (name string)', () => {
    it('creates a single participant and returns 201', async () => {
      const created = { id: 'p1', name: 'Carol' }
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }) }),
      })
      const res = await POST(makeRequest({ name: 'Carol' }), { params })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual(created)
    })

    it('returns 400 for a blank name', async () => {
      const res = await POST(makeRequest({ name: '   ' }), { params })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('INVALID_INPUT')
    })

    it('returns 400 for a missing name field', async () => {
      const res = await POST(makeRequest({}), { params })
      expect(res.status).toBe(400)
    })

    it('returns 409 for duplicate participant', async () => {
      mockFrom.mockReturnValue({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }) }),
      })
      const res = await POST(makeRequest({ name: 'Alice' }), { params })
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('PARTICIPANT_EXISTS')
    })
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const res = await POST(makeRequest({ name: 'Alice' }), { params })
    expect(res.status).toBe(500)
  })
})
