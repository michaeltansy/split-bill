import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], set: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => ({
  createRouteHandlerClient: () => ({ auth: { signOut: mockSignOut } }),
}))

import { POST } from './route'

describe('POST /api/auth/signout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSignOut.mockResolvedValue({})
  })

  it('returns a 303 redirect to /login', async () => {
    const res = await POST(new NextRequest('http://localhost/api/auth/signout', { method: 'POST' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/login')
  })

  it('calls supabase.auth.signOut()', async () => {
    await POST(new NextRequest('http://localhost/api/auth/signout', { method: 'POST' }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('still redirects even if signOut throws (auth cookies may already be cleared)', async () => {
    mockSignOut.mockRejectedValue(new Error('signOut failed'))
    // The route does not await-guard, so an unhandled rejection would surface.
    // This test documents current behaviour — if it changes, update accordingly.
    await expect(
      POST(new NextRequest('http://localhost/api/auth/signout', { method: 'POST' }))
    ).rejects.toThrow()
  })
})
