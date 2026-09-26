import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { ocrRatelimit } from '@/lib/ratelimit';
import { sanitiseDiscount } from '@/lib/ocrDiscount';

const PROMPT = `You are a receipt parser. Analyse this receipt image and return JSON matching the provided schema.

Rules:
- price is the UNIT price (line total divided by quantity).
- quantity defaults to 1 if not visible.
- Indonesian thousands separators: "58,000" = 58000, "250.635" = 250635. Never interpret as decimals.
- tax_amount is the total tax (PB1, PPN, etc.). Use 0 if not present.
- service_amount is the service charge / tip line. Use 0 if not present.
- discount is a bill-level reduction line (DISCOUNT, DISKON, PROMO, POTONGAN). If the line shows a percent (e.g. "DISCOUNT 15%"), return discount_type "percentage" and the percent number (15). Otherwise return discount_type "amount" and the absolute value as a positive number. If there is no discount, return discount_type "percentage" and discount_value 0. Never list the discount as an item.
- Truncate item names to 100 characters.
- Skip non-item lines (subtotal, total, change, payment lines).`;

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          price: { type: SchemaType.NUMBER },
          quantity: { type: SchemaType.NUMBER },
        },
        required: ['name', 'price', 'quantity'],
      },
    },
    tax_amount: { type: SchemaType.NUMBER },
    service_amount: { type: SchemaType.NUMBER },
    discount_type: { type: SchemaType.STRING, format: 'enum', enum: ['percentage', 'amount'] },
    discount_value: { type: SchemaType.NUMBER },
  },
  required: ['items', 'tax_amount', 'service_amount'],
};

type ParsedItem = { name: string; price: number; quantity: number };

function sanitiseItems(raw: unknown): ParsedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i): ParsedItem | null => {
      if (typeof i !== 'object' || i === null) return null;
      const obj = i as Record<string, unknown>;
      const name = String(obj.name ?? '').trim().slice(0, 100);
      const price = Number(obj.price);
      const quantity = Math.max(1, Math.floor(Number(obj.quantity) || 1));
      if (!name || !Number.isFinite(price) || price <= 0) return null;
      return { name, price, quantity };
    })
    .filter((x): x is ParsedItem => x !== null);
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function POST(request: NextRequest) {
  // Feature gate: API key required
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Bill scan is not configured on this server.', code: 'OCR_DISABLED' },
      { status: 503 }
    );
  }

  // Per-IP rate limit (stays well under Gemini's free-tier RPM)
  if (ocrRatelimit) {
    const { success, reset } = await ocrRatelimit.limit(clientIp(request));
    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: `You've used the scan quota for this minute. Try again in ~${retryAfter}s, or fill the form manually.`,
          code: 'RATE_LIMITED',
          retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }
  }

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an image.' },
        { status: 400 }
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    // No retry on 429 — those count against the free-tier quota.
    // ONE retry on 503 only — model overload, request never reached the model so quota is untouched.
    const parts = [PROMPT, { inlineData: { mimeType: file.type, data: base64 } }];
    let result;
    try {
      result = await model.generateContent(parts);
    } catch (firstError) {
      const status = (firstError as { status?: number })?.status;
      if (status !== 503) throw firstError;
      console.warn('[OCR] Gemini 503 overload — retrying once after 1.5s');
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 500));
      result = await model.generateContent(parts);
    }

    const rawText = result.response.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('[OCR] Gemini returned non-JSON response:', rawText.slice(0, 200));
      return NextResponse.json(
        { error: 'Could not extract bill data. Please fill the form manually.', code: 'OCR_PARSE_FAILED' },
        { status: 502 }
      );
    }

    const items = sanitiseItems(parsed.items);
    const tax_amount = Number.isFinite(Number(parsed.tax_amount)) ? Math.max(0, Number(parsed.tax_amount)) : 0;
    const service_amount = Number.isFinite(Number(parsed.service_amount))
      ? Math.max(0, Number(parsed.service_amount))
      : 0;

    const discount = sanitiseDiscount(parsed.discount_type, parsed.discount_value);

    return NextResponse.json({ items, tax_amount, service_amount, ...discount });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json(
        {
          error:
            'Gemini free-tier limit reached. Wait ~1 minute and try again — or fill the form manually.',
          code: 'GEMINI_QUOTA',
        },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    if (status === 503) {
      return NextResponse.json(
        {
          error:
            'Gemini is temporarily overloaded. Try again in a moment, or fill the form manually.',
          code: 'GEMINI_OVERLOADED',
        },
        { status: 503, headers: { 'Retry-After': '15' } }
      );
    }
    console.error('[OCR] Gemini error:', error);
    return NextResponse.json(
      { error: 'Failed to scan image. Please fill the form manually.', code: 'OCR_FAILED' },
      { status: 500 }
    );
  }
}
