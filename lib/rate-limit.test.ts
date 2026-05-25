import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, _resetRateLimitStore } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimitStore());

  it("allows N calls under the limit, blocks the N+1th", () => {
    const opts = { key: "alice", limit: 5, windowMs: 60_000, now: 1_000 };
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(opts).ok, `call ${i + 1}`).toBe(true);
    }
    expect(rateLimit(opts).ok).toBe(false);
  });

  it("resets after the window elapses", () => {
    const base = 1_000;
    for (let i = 0; i < 5; i++) {
      rateLimit({ key: "bob", limit: 5, windowMs: 60_000, now: base + i });
    }
    expect(rateLimit({ key: "bob", limit: 5, windowMs: 60_000, now: base + 5 }).ok).toBe(false);

    // Past the window.
    expect(
      rateLimit({ key: "bob", limit: 5, windowMs: 60_000, now: base + 60_001 }).ok,
    ).toBe(true);
  });

  it("buckets are independent per key", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit({ key: "alice", limit: 5, windowMs: 60_000, now: 1_000 });
    }
    // alice is now at limit
    expect(rateLimit({ key: "alice", limit: 5, windowMs: 60_000, now: 1_000 }).ok).toBe(false);
    // bob is fresh
    expect(rateLimit({ key: "bob", limit: 5, windowMs: 60_000, now: 1_000 }).ok).toBe(true);
  });

  it("LRU-evicts entries beyond MAX_KEYS (10_000) without crashing", () => {
    // Smoke: 10_500 distinct keys, then verify a fresh key still works and
    // the very first key was evicted (its bucket reset).
    for (let i = 0; i < 10_500; i++) {
      rateLimit({ key: `k${i}`, limit: 1, windowMs: 60_000, now: 1_000 });
    }
    // The first key would have been evicted; a fresh call gets a new bucket.
    expect(rateLimit({ key: "k0", limit: 1, windowMs: 60_000, now: 1_000 }).ok).toBe(true);
    // The last-added key was at its limit (count=1), next call exceeds.
    expect(rateLimit({ key: "k10499", limit: 1, windowMs: 60_000, now: 1_000 }).ok).toBe(false);
  });

  it("reports remaining and resetAt accurately", () => {
    const r1 = rateLimit({ key: "carol", limit: 3, windowMs: 60_000, now: 1_000 });
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r1.resetAt).toBe(61_000);

    rateLimit({ key: "carol", limit: 3, windowMs: 60_000, now: 1_000 });
    const r3 = rateLimit({ key: "carol", limit: 3, windowMs: 60_000, now: 1_000 });
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = rateLimit({ key: "carol", limit: 3, windowMs: 60_000, now: 1_000 });
    expect(r4.ok).toBe(false);
  });
});
