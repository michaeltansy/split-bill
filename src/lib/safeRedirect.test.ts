import { describe, it, expect } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  describe('falsy / missing input', () => {
    it('should return the default fallback for null', () => {
      expect(safeRedirect(null)).toBe('/')
    })

    it('should return the default fallback for undefined', () => {
      expect(safeRedirect(undefined)).toBe('/')
    })

    it('should return the default fallback for an empty string', () => {
      expect(safeRedirect('')).toBe('/')
    })

    it('should return a custom fallback when provided', () => {
      expect(safeRedirect(null, '/dashboard')).toBe('/dashboard')
      expect(safeRedirect('', '/login')).toBe('/login')
    })
  })

  describe('safe same-origin paths', () => {
    it('should allow a simple relative path', () => {
      expect(safeRedirect('/session/123')).toBe('/session/123')
    })

    it('should allow the root path', () => {
      expect(safeRedirect('/')).toBe('/')
    })

    it('should preserve query strings and fragments', () => {
      expect(safeRedirect('/session/123?tab=items#top')).toBe(
        '/session/123?tab=items#top'
      )
    })
  })

  describe('open-redirect vectors (must be blocked)', () => {
    it('should block absolute http URLs', () => {
      expect(safeRedirect('http://evil.com')).toBe('/')
    })

    it('should block absolute https URLs', () => {
      expect(safeRedirect('https://evil.com/path')).toBe('/')
    })

    it('should block protocol-relative URLs (//evil.com)', () => {
      expect(safeRedirect('//evil.com')).toBe('/')
    })

    it('should block backslash protocol-relative tricks (/\\evil.com)', () => {
      expect(safeRedirect('/\\evil.com')).toBe('/')
    })

    it('should block any path containing a backslash', () => {
      expect(safeRedirect('/foo\\bar')).toBe('/')
      expect(safeRedirect('/\\/evil.com')).toBe('/')
    })

    it('should block paths that do not start with a slash', () => {
      expect(safeRedirect('evil.com')).toBe('/')
      expect(safeRedirect('javascript:alert(1)')).toBe('/')
    })

    it('should fall back to the custom fallback when blocking', () => {
      expect(safeRedirect('https://evil.com', '/home')).toBe('/home')
      expect(safeRedirect('//evil.com', '/home')).toBe('/home')
    })
  })
})
