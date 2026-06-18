import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { GET, PATCH } from './route'

const FUTURE = new Date(Date.now() + 86_400_000).toISOString()
const PAST   = new Date(Date.now() - 86_400_000).toISOString()

function makeRequest(method = 'GET', body?: unknown) {
  return new NextRequest('http://localhost/api/sessions/s1', {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  })
}

const params = Promise.resolve({ id: 's1' })

function setupGet({
  session = null as object | null,
  sessionError = null as object | null,
  participants = [] as object[],
  items = [] as object[],
  bankAccount = null as object | null,
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'sessions') return {
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: session, error: sessionError }) }) }),
    }
    if (table === 'participants') return {
      select: () => ({ eq: () => Promise.resolve({ data: participants, error: null }) }),
    }
    if (table === 'items') return {
      select: () => ({ eq: () => Promise.resolve({ data: items, error: null }) }),
    }
    if (table === 'item_assignments') return {
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
    }
    if (table === 'session_bank_accounts') return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: bankAccount }) }) }),
    }
  })
}

describe('GET /api/sessions/[id]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 404 when the session is not found', async () => {
    setupGet({ sessionError: { message: 'Not found' } })
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('SESSION_NOT_FOUND')
  })

  it('returns 410 when the session is expired', async () => {
    setupGet({ session: { id: 's1', expires_at: PAST } })
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.code).toBe('SESSION_EXPIRED')
  })

  it('returns 200 with assembled session data', async () => {
    const mockSession = { id: 's1', expires_at: FUTURE }
    const mockParticipants = [{ id: 'p1', name: 'Alice' }]
    const mockItems = [{ id: 'i1', name: 'Pizza' }]
    const mockBank = { id: 'b1', bank_name: 'BCA' }

    setupGet({
      session: mockSession,
      participants: mockParticipants,
      items: mockItems,
      bankAccount: mockBank,
    })

    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session).toEqual(mockSession)
    expect(body.participants).toEqual(mockParticipants)
    expect(body.bank_account).toEqual(mockBank)
  })

  it('attaches assignments to their items', async () => {
    setupGet({ session: { id: 's1', expires_at: FUTURE }, items: [{ id: 'i1', name: 'Burger' }] })
    // item_assignments returns rows for i1
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', expires_at: FUTURE }, error: null }) }) }),
      }
      if (table === 'participants') return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
      if (table === 'items') return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'i1' }] }) }) }
      if (table === 'item_assignments') return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'a1', item_id: 'i1', participant_id: 'p1' }] }) }) }
      if (table === 'session_bank_accounts') return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }
    })

    const res = await GET(makeRequest(), { params })
    const body = await res.json()
    expect(body.items[0].assignments).toHaveLength(1)
    expect(body.items[0].assignments[0].id).toBe('a1')
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('DB down') })
    const res = await GET(makeRequest(), { params })
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/sessions/[id]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 200 with updated session data', async () => {
    const updated = { id: 's1', tax_amount: 5000 }
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: updated, error: null }) }) }) }),
    })
    const res = await PATCH(makeRequest('PATCH', { tax_amount: 5000 }), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
  })

  it('returns 400 when the update fails', async () => {
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Bad field' } }) }) }) }),
    })
    const res = await PATCH(makeRequest('PATCH', {}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 on unexpected errors', async () => {
    mockFrom.mockImplementation(() => { throw new Error('crash') })
    const res = await PATCH(makeRequest('PATCH', {}), { params })
    expect(res.status).toBe(500)
  })
})
