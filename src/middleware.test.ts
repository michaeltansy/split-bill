import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRatelimitLimit, mockGetUser } = vi.hoisted(() => ({
  mockRatelimitLimit: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@/lib/ratelimit', () => ({
  ratelimit: { limit: mockRatelimitLimit },
}))

vi.mock('@/lib/supabase', () => ({
  createMiddlewareClient: () => ({ auth: { getUser: mockGetUser } }),
}))

import { middleware } from './middleware'

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers })
}

describe('middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('API routes — rate limiting', () => {
    it('returns 429 with rate-limit headers when the limit is exceeded', async () => {
      const reset = Date.now() + 5000
      mockRatelimitLimit.mockResolvedValue({ success: false, limit: 30, remaining: 0, reset })

      const res = await middleware(makeRequest('/api/sessions'))

      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.code).toBe('RATE_LIMITED')
      expect(res.headers.get('X-RateLimit-Limit')).toBe('30')
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(res.headers.get('Retry-After')).toBeDefined()
    })

    it('passes through and sets rate-limit headers when under the limit', async () => {
      mockRatelimitLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 10000 })

      const res = await middleware(makeRequest('/api/sessions'))

      expect(res.status).toBe(200)
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('29')
      expect(res.headers.get('X-RateLimit-Limit')).toBe('30')
    })

    it('uses the first IP in the x-forwarded-for header', async () => {
      mockRatelimitLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 10000 })

      await middleware(makeRequest('/api/sessions', { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))

      expect(mockRatelimitLimit).toHaveBeenCalledWith('1.2.3.4')
    })

    it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
      mockRatelimitLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 10000 })

      await middleware(makeRequest('/api/sessions', { 'x-real-ip': '9.8.7.6' }))

      expect(mockRatelimitLimit).toHaveBeenCalledWith('9.8.7.6')
    })

    it('falls back to 127.0.0.1 when no IP header is present', async () => {
      mockRatelimitLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 10000 })

      await middleware(makeRequest('/api/ocr'))

      expect(mockRatelimitLimit).toHaveBeenCalledWith('127.0.0.1')
    })
  })

  describe('Page routes — auth gating', () => {
    it('redirects unauthenticated users from the protected "/" page to /login', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const res = await middleware(makeRequest('/'))

      expect(res.status).toBe(307)
      const location = res.headers.get('location') ?? ''
      expect(location).toContain('/login')
      expect(location).toContain('redirect=%2F')
    })

    it('allows unauthenticated users through non-protected pages', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const res = await middleware(makeRequest('/session/abc123'))

      expect(res.status).toBe(200)
    })

    it('allows authenticated users through the protected "/" page', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      const res = await middleware(makeRequest('/'))

      expect(res.status).toBe(200)
    })

    it('allows authenticated users through non-protected pages', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      const res = await middleware(makeRequest('/session/abc123'))

      expect(res.status).toBe(200)
    })
  })
})
