// In-process token-bucket rate limiter.
//
// Single-replica only. Pin the Railway service to numReplicas=1, or this
// gives the wrong answer.
// Resets across container restarts and Next dev HMR — that's acceptable for
// the MVP. Revisit (Redis / Upstash) when traffic justifies it.
//
// Map is bounded at MAX_KEYS via insertion-order LRU eviction to prevent OOM
// from an attacker spraying random keys.

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_KEYS = 10_000;

const g = globalThis as unknown as { rateLimitStore?: Map<string, Bucket> };
const store: Map<string, Bucket> = g.rateLimitStore ?? new Map<string, Bucket>();
g.rateLimitStore = store;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = opts.now ?? Date.now();
  const { key, limit, windowMs } = opts;

  let bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
  } else {
    // Touch: re-insert to move to end (LRU).
    store.delete(key);
  }

  bucket.count += 1;
  store.set(key, bucket);

  // LRU eviction.
  while (store.size > MAX_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }

  const ok = bucket.count <= limit;
  return { ok, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

// Test-only.
export function _resetRateLimitStore(): void {
  store.clear();
}
