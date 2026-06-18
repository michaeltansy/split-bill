import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGenerateContent, mockRatelimitLimit } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockRatelimitLimit: vi.fn(),
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return { getGenerativeModel: () => ({ generateContent: mockGenerateContent }) }
  }),
  SchemaType: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
}))

vi.mock('@/lib/ratelimit', () => ({
  ocrRatelimit: { limit: mockRatelimitLimit },
  ratelimit: null,
}))

import { POST } from './route'

function makeImageRequest(options: { type?: string; size?: number } = {}) {
  const { type = 'image/jpeg', size = 100 } = options
  const bytes = new Uint8Array(size)
  const file = new File([bytes], 'receipt.jpg', { type })
  const formData = new FormData()
  formData.append('image', file)
  return new NextRequest('http://localhost/api/ocr', { method: 'POST', body: formData })
}

function geminiResponse(json: unknown) {
  mockGenerateContent.mockResolvedValue({
    response: { text: () => JSON.stringify(json) },
  })
}

describe('POST /api/ocr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GEMINI_API_KEY = 'test-key'
    mockRatelimitLimit.mockResolvedValue({ success: true, reset: Date.now() + 60000 })
  })

  afterEach(() => {
    delete process.env.GEMINI_API_KEY
  })

  it('returns 503 when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('OCR_DISABLED')
  })

  it('returns 429 when the OCR rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValue({ success: false, reset: Date.now() + 30000 })
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('RATE_LIMITED')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })

  it('returns 400 when no image is attached', async () => {
    const formData = new FormData()
    const req = new NextRequest('http://localhost/api/ocr', { method: 'POST', body: formData })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-image file type', async () => {
    const res = await POST(makeImageRequest({ type: 'application/pdf' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Invalid file type')
  })

  it('returns 400 for a file larger than 10 MB', async () => {
    // Patch size on the File instance so it survives the FormData round-trip via spyOn
    const bigFile = new File([], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024, configurable: true })
    const fd = new FormData()
    fd.append('image', bigFile)
    const req = makeImageRequest()
    vi.spyOn(req, 'formData').mockResolvedValue(fd as any)
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('too large')
  })

  it('returns 200 with sanitized items on a successful Gemini response', async () => {
    geminiResponse({
      items: [
        { name: 'Nasi Goreng', price: 25000, quantity: 1 },
        { name: 'Es Teh', price: 5000, quantity: 2 },
      ],
      tax_amount: 3000,
      service_amount: 2000,
    })
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items[0].name).toBe('Nasi Goreng')
    expect(body.tax_amount).toBe(3000)
    expect(body.service_amount).toBe(2000)
  })

  it('strips items with no name or non-positive price', async () => {
    geminiResponse({
      items: [
        { name: '', price: 1000, quantity: 1 },
        { name: 'Good', price: 0, quantity: 1 },
        { name: 'Good', price: 10000, quantity: 1 },
      ],
      tax_amount: 0,
      service_amount: 0,
    })
    const res = await POST(makeImageRequest())
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].name).toBe('Good')
  })

  it('clamps negative tax/service amounts to 0', async () => {
    geminiResponse({ items: [{ name: 'X', price: 5000, quantity: 1 }], tax_amount: -100, service_amount: -50 })
    const res = await POST(makeImageRequest())
    const body = await res.json()
    expect(body.tax_amount).toBe(0)
    expect(body.service_amount).toBe(0)
  })

  it('truncates item names to 100 characters', async () => {
    geminiResponse({
      items: [{ name: 'A'.repeat(150), price: 1000, quantity: 1 }],
      tax_amount: 0,
      service_amount: 0,
    })
    const res = await POST(makeImageRequest())
    const body = await res.json()
    expect(body.items[0].name.length).toBe(100)
  })

  it('returns 502 when Gemini returns non-JSON', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'not json at all' } })
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('OCR_PARSE_FAILED')
  })

  it('returns 429 when Gemini throws a 429 error', async () => {
    const err = Object.assign(new Error('quota'), { status: 429 })
    mockGenerateContent.mockRejectedValue(err)
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('GEMINI_QUOTA')
  })

  it('returns 503 when Gemini throws 503 twice (both attempts fail)', async () => {
    const err = Object.assign(new Error('overload'), { status: 503 })
    mockGenerateContent.mockRejectedValue(err)
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('GEMINI_OVERLOADED')
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('succeeds when the first Gemini call 503s but the retry succeeds', async () => {
    const err = Object.assign(new Error('overload'), { status: 503 })
    mockGenerateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ items: [], tax_amount: 0, service_amount: 0 }) },
      })
    const res = await POST(makeImageRequest())
    expect(res.status).toBe(200)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })
})
