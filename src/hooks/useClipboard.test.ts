import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClipboard } from './useClipboard'

const mockWriteText = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useClipboard', () => {
  it('starts with copied=false and no error', () => {
    const { result } = renderHook(() => useClipboard())
    expect(result.current.copied).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets copied=true and returns true on a successful copy', async () => {
    mockWriteText.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClipboard())

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.copy('hello world')
    })

    expect(success).toBe(true)
    expect(result.current.copied).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('resets copied to false after the default 2000 ms delay', async () => {
    mockWriteText.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClipboard())

    await act(async () => {
      await result.current.copy('hello')
    })
    expect(result.current.copied).toBe(true)

    act(() => vi.advanceTimersByTime(2001))
    expect(result.current.copied).toBe(false)
  })

  it('respects a custom resetDelay', async () => {
    mockWriteText.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClipboard(500))

    await act(async () => {
      await result.current.copy('hello')
    })

    act(() => vi.advanceTimersByTime(499))
    expect(result.current.copied).toBe(true)

    act(() => vi.advanceTimersByTime(2))
    expect(result.current.copied).toBe(false)
  })

  it('sets error, keeps copied=false, and returns false when writeText throws an Error', async () => {
    mockWriteText.mockRejectedValue(new Error('Permission denied'))
    const { result } = renderHook(() => useClipboard())

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.copy('hello')
    })

    expect(success).toBe(false)
    expect(result.current.copied).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Permission denied')
  })

  it('wraps a non-Error rejection in a generic Error', async () => {
    mockWriteText.mockRejectedValue('string rejection')
    const { result } = renderHook(() => useClipboard())

    await act(async () => {
      await result.current.copy('hello')
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Failed to copy')
  })

  it('calls navigator.clipboard.writeText with the provided text', async () => {
    mockWriteText.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClipboard())

    await act(async () => {
      await result.current.copy('copy this text')
    })

    expect(mockWriteText).toHaveBeenCalledWith('copy this text')
  })
})
