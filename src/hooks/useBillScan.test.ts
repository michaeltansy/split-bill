import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBillScan } from './useBillScan'
import type { ExtractedBill } from './useBillScan'

const mockBill: ExtractedBill = {
  items: [{ name: 'Nasi Goreng', price: 25000, quantity: 1 }],
  tax_amount: 2500,
  service_amount: 2500,
}

function makeFile(name = 'receipt.jpg') {
  return new File(['image data'], name, { type: 'image/jpeg' })
}

function mockFetch(ok: boolean, body: unknown, status = ok ? 200 : 400) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useBillScan', () => {
  it('starts with correct initial state', () => {
    const { result } = renderHook(() => useBillScan())
    expect(result.current.isScanning).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.cooldownRemaining).toBe(0)
    expect(result.current.isCoolingDown).toBe(false)
  })

  it('returns the extracted bill on a successful scan', async () => {
    mockFetch(true, mockBill)
    const { result } = renderHook(() => useBillScan())

    let scanResult: ExtractedBill | null = null
    await act(async () => {
      scanResult = await result.current.scan(makeFile())
    })

    expect(scanResult).toEqual(mockBill)
    expect(result.current.isScanning).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('starts a 6-second cooldown after a successful scan', async () => {
    mockFetch(true, mockBill)
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })

    expect(result.current.isCoolingDown).toBe(true)
    expect(result.current.cooldownRemaining).toBe(6)
  })

  it('counts the cooldown down to zero over 6 seconds', async () => {
    mockFetch(true, mockBill)
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })

    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.cooldownRemaining).toBe(3)
    expect(result.current.isCoolingDown).toBe(true)

    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.cooldownRemaining).toBe(0)
    expect(result.current.isCoolingDown).toBe(false)
  })

  it('sets error and returns null when the API responds with a non-ok status', async () => {
    mockFetch(false, { error: 'Rate limited' }, 429)
    const { result } = renderHook(() => useBillScan())

    let scanResult: ExtractedBill | null = null
    await act(async () => {
      scanResult = await result.current.scan(makeFile())
    })

    expect(scanResult).toBeNull()
    expect(result.current.error).toBe('Rate limited')
  })

  it('falls back to the HTTP status in the error message when body has no error field', async () => {
    mockFetch(false, {}, 503)
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })

    expect(result.current.error).toBe('Failed to scan (503)')
  })

  it('starts the cooldown even after a failed scan', async () => {
    mockFetch(false, { error: 'Server error' }, 500)
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })

    expect(result.current.isCoolingDown).toBe(true)
  })

  it('sets a generic error message on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')))
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.isCoolingDown).toBe(true)
  })

  it('sets a generic fallback message for non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce('some string'))
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })

    expect(result.current.error).toBe('Failed to scan image')
  })

  it('reset() clears the error without affecting cooldown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Oops')))
    const { result } = renderHook(() => useBillScan())

    await act(async () => {
      await result.current.scan(makeFile())
    })
    expect(result.current.error).toBe('Oops')

    act(() => result.current.reset())
    expect(result.current.error).toBeNull()
    expect(result.current.isCoolingDown).toBe(true)
  })

  it('sends the file as "image" in a FormData POST to /api/ocr', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBill),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useBillScan())
    const file = makeFile('scan.jpg')

    await act(async () => {
      await result.current.scan(file)
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/ocr',
      expect.objectContaining({ method: 'POST' })
    )
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).get('image')).toBe(file)
  })
})
