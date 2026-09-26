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

let lastSessionInsert: Record<string, unknown> | null = null

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
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              lastSessionInsert = row
              return Promise.resolve({ data: sessionError ? null : data, error: sessionError })
            },
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

import { GET } from './route'

function makeGetRequest(query = '') {
  return new NextRequest(`http://localhost/api/sessions${query}`)
}

// A minimal thenable query builder: every chained method returns itself so
// call order in the handler doesn't matter, and awaiting it resolves to the
// configured result (mirrors how supabase-js query builders behave).
function makeQueryBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'limit', 'or']
  methods.forEach((m) => {
    builder[m] = vi.fn().mockReturnValue(builder)
  })
  builder.then = (resolve: (v: typeof result) => void) => resolve(result)
  return builder
}

describe('GET /api/sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('UNAUTHENTICATED')
  })

  it('returns 400 for an invalid cursor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await GET(makeGetRequest('?cursor=not-valid-base64!!'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_INPUT')
  })

  it('returns sessions with nextCursor null when a page has no more rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const rows = [
      { id: 's1', created_at: '2026-09-02T10:00:00.000Z' },
      { id: 's2', created_at: '2026-09-01T10:00:00.000Z' },
    ]
    mockFrom.mockReturnValue(makeQueryBuilder({ data: rows, error: null }))

    const res = await GET(makeGetRequest('?limit=10'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toEqual(rows)
    expect(body.nextCursor).toBeNull()
  })

  it('returns a nextCursor and trims the extra row when more results exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const rows = [
      { id: 's1', created_at: '2026-09-02T10:00:00.000Z' },
      { id: 's2', created_at: '2026-09-01T10:00:00.000Z' },
      { id: 's3', created_at: '2026-08-31T10:00:00.000Z' },
    ]
    mockFrom.mockReturnValue(makeQueryBuilder({ data: rows, error: null }))

    const res = await GET(makeGetRequest('?limit=2'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toEqual(rows.slice(0, 2))
    expect(body.nextCursor).toBeTruthy()

    const decoded = JSON.parse(Buffer.from(body.nextCursor, 'base64url').toString('utf8'))
    expect(decoded).toEqual({ createdAt: rows[1].created_at, id: rows[1].id })
  })

  it('returns 400 when the query errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'DB error' } }))

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('DB error')
  })

  it('returns 500 on unexpected errors', async () => {
    mockGetUser.mockRejectedValue(new Error('DB down'))

    const res = await GET(makeGetRequest())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTERNAL_ERROR')
  })
})

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

  it('computes discount and totals server-side, ignoring client-sent derived values', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setupSessionsTable()
    lastSessionInsert = null

    const res = await POST(
      makeRequest({
        subtotal: 1_287_000,
        tax_amount: 117_053,
        service_amount: 76_577,
        discount_type: 'percentage',
        discount_value: 15,
        grand_total: 1,
        tax_percentage: 99,
        service_percentage: 99,
        discount_amount: 5,
      })
    )

    expect(res.status).toBe(201)
    expect(lastSessionInsert).toMatchObject({
      subtotal: 1_287_000,
      discount_type: 'percentage',
      discount_value: 15,
      discount_amount: 193_050,
      grand_total: 1_287_580,
      tax_percentage: 10.7,
      service_percentage: 7,
      created_by: 'user-1',
    })
  })

  it('returns 400 INVALID_DISCOUNT for a discount above the subtotal', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setupSessionsTable()

    const res = await POST(
      makeRequest({ subtotal: 100_000, discount_type: 'amount', discount_value: 150_000 })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_DISCOUNT')
    expect(mockFrom).not.toHaveBeenCalled()
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
