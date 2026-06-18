import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// vi.hoisted runs before module imports, so these refs are available in vi.mock factories
const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => ({
  createRouteHandlerClient: () => ({ auth: { getUser: mockGetUser } }),
  createServerClient: () => ({ from: mockFrom }),
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function setupSessionsTable({
  data = { id: 'session-1' },
  sessionError = null,
  bankError = null,
}: {
  data?: object
  sessionError?: { message: string } | null
  bankError?: { message: string } | null
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'sessions') {
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: sessionError ? null : data, error: sessionError }),
          }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }
    }
    if (table === 'session_bank_accounts') {
      return {
        insert: () => Promise.resolve({ error: bankError }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('POST /api/sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('UNAUTHENTICATED')
  })

  it('creates a session and returns 201 when no bank_account is provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setupSessionsTable({ data: { id: 'session-1', subtotal: 0 } })

    const res = await POST(makeRequest({ subtotal: 0 }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('session-1')
  })

  it('returns 400 when the session insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setupSessionsTable({ sessionError: { message: 'DB error' } })

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('DB error')
  })

  it('returns 500 on unexpected errors (e.g. getUser throws)', async () => {
    mockGetUser.mockRejectedValue(new Error('DB down'))

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  describe('bank_account validation', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    })

    it.each([
      ['account number too short (7 digits)', '1234567'],
      ['account number too long (21 digits)', '123456789012345678901'],
      ['account number contains letters', '1234567A'],
      ['account number contains spaces', '1234 5678'],
    ])('returns 400 for invalid account number: %s', async (_, number) => {
      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'BCA', bank_account_number: number, bank_account_holder: 'Alice' },
        })
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('INVALID_INPUT')
    })

    it('returns 400 when bank_name is empty', async () => {
      const res = await POST(
        makeRequest({
          bank_account: { bank_name: '   ', bank_account_number: '12345678', bank_account_holder: 'Alice' },
        })
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when bank_name exceeds 30 characters', async () => {
      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'B'.repeat(31), bank_account_number: '12345678', bank_account_holder: 'Alice' },
        })
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when account holder name is empty', async () => {
      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'BCA', bank_account_number: '12345678', bank_account_holder: '   ' },
        })
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when account holder name exceeds 80 characters', async () => {
      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'BCA', bank_account_number: '12345678', bank_account_holder: 'H'.repeat(81) },
        })
      )
      expect(res.status).toBe(400)
    })

    it('accepts an 8-digit account number (minimum boundary)', async () => {
      setupSessionsTable()
      mockFrom.mockImplementation((table: string) => {
        if (table === 'sessions') return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 's1' }, error: null }) }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
        if (table === 'session_bank_accounts') return {
          insert: () => Promise.resolve({ error: null }),
        }
      })

      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'BCA', bank_account_number: '12345678', bank_account_holder: 'Alice' },
        })
      )
      expect(res.status).toBe(201)
    })

    it('accepts a 20-digit account number (maximum boundary)', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'sessions') return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 's1' }, error: null }) }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
        if (table === 'session_bank_accounts') return {
          insert: () => Promise.resolve({ error: null }),
        }
      })

      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'BCA', bank_account_number: '12345678901234567890', bank_account_holder: 'Alice' },
        })
      )
      expect(res.status).toBe(201)
    })

    it('rolls back the session and returns 400 when bank account insert fails', async () => {
      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
      const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'sessions') return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'session-1' }, error: null }) }) }),
          delete: mockDelete,
        }
        if (table === 'session_bank_accounts') return {
          insert: () => Promise.resolve({ error: { message: 'Constraint violation' } }),
        }
      })

      const res = await POST(
        makeRequest({
          bank_account: { bank_name: 'BCA', bank_account_number: '12345678', bank_account_holder: 'Alice' },
        })
      )

      expect(res.status).toBe(400)
      expect(mockDelete).toHaveBeenCalled()
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'session-1')
    })
  })
})
