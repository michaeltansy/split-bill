import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Sliding window: 30 requests per 10 seconds per IP.
// Tune via UPSTASH_RATELIMIT_WINDOW (e.g. "10 s") and UPSTASH_RATELIMIT_REQUESTS.
const REQUESTS = Number(process.env.UPSTASH_RATELIMIT_REQUESTS ?? 30);
const WINDOW = (process.env.UPSTASH_RATELIMIT_WINDOW ?? '10 s') as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`;

let ratelimitInstance: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimitInstance = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(REQUESTS, WINDOW),
    analytics: true,
    prefix: 'splitbill',
  });
} else if (process.env.NODE_ENV === 'production') {
  console.warn(
    '[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting is DISABLED. ' +
      'Set both env vars to enable.'
  );
}

export const ratelimit = ratelimitInstance;
