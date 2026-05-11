import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Global API limit: sliding window 30 requests per 10 seconds per IP.
// Tunable via UPSTASH_RATELIMIT_REQUESTS / UPSTASH_RATELIMIT_WINDOW.
const REQUESTS = Number(process.env.UPSTASH_RATELIMIT_REQUESTS ?? 30);
const WINDOW = (process.env.UPSTASH_RATELIMIT_WINDOW ?? '10 s') as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`;

// OCR-specific limit: stay safely under Gemini free-tier RPM (≈30).
// 8 requests per minute per IP allows multi-tab use without burning quota.
const OCR_REQUESTS = Number(process.env.UPSTASH_OCR_RATELIMIT_REQUESTS ?? 8);
const OCR_WINDOW = (process.env.UPSTASH_OCR_RATELIMIT_WINDOW ?? '1 m') as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`;

let ratelimitInstance: Ratelimit | null = null;
let ocrRatelimitInstance: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = Redis.fromEnv();

  ratelimitInstance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(REQUESTS, WINDOW),
    analytics: true,
    prefix: 'splitbill',
  });

  ocrRatelimitInstance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(OCR_REQUESTS, OCR_WINDOW),
    analytics: true,
    prefix: 'splitbill:ocr',
  });
} else if (process.env.NODE_ENV === 'production') {
  console.warn(
    '[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting is DISABLED. ' +
      'Set both env vars to enable.'
  );
}

export const ratelimit = ratelimitInstance;
export const ocrRatelimit = ocrRatelimitInstance;
