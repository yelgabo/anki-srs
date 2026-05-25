import { describe, it, expect } from "vitest";
import { computeStreak } from "./streak";

const TZ = "UTC";
const NOW = new Date("2026-05-25T12:00:00Z"); // Monday, 2026-W22

describe("computeStreak — daily", () => {
  it("zero reviews → daily 0", () => {
    const r = computeStreak({ reviewDays: [], freezeDays: [], timezone: TZ, now: NOW });
    expect(r.daily).toBe(0);
    expect(r.longest).toBe(0);
    expect(r.lastReviewed).toBeNull();
  });

  it("single review today → daily 1", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-25"],
      freezeDays: [],
      timezone: TZ,
      now: NOW,
    });
    expect(r.daily).toBe(1);
    expect(r.longest).toBe(1);
    expect(r.lastReviewed).toBe("2026-05-25");
  });

  it("7 consecutive days → daily 7", () => {
    const days = [19, 20, 21, 22, 23, 24, 25].map((d) => `2026-05-${String(d).padStart(2, "0")}`);
    const r = computeStreak({ reviewDays: days, freezeDays: [], timezone: TZ, now: NOW });
    expect(r.daily).toBe(7);
    expect(r.longest).toBe(7);
  });

  it("one-day gap covered by freeze → daily continues", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-23", "2026-05-25"],
      freezeDays: ["2026-05-24"],
      timezone: TZ,
      now: NOW,
    });
    expect(r.daily).toBe(3);
  });

  it("one-day gap NOT covered → daily resets to today only", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-23", "2026-05-25"],
      freezeDays: [],
      timezone: TZ,
      now: NOW,
    });
    expect(r.daily).toBe(1);
  });

  it("assumeActiveDays projects coverage without writes", () => {
    // Reviewed 5/23 only; freezeDays empty; today is 5/25.
    // Real: daily = 0 (no review today, gap on 5/24, no freeze).
    // Projected with today + freeze on 5/24 (hypothetical): would be 3.
    const real = computeStreak({
      reviewDays: ["2026-05-23"],
      freezeDays: [],
      timezone: TZ,
      now: NOW,
    });
    expect(real.daily).toBe(0);
    const projected = computeStreak({
      reviewDays: ["2026-05-23"],
      freezeDays: [],
      timezone: TZ,
      now: NOW,
      assumeActiveDays: ["2026-05-24", "2026-05-25"], // hypothetical freeze + today
    });
    expect(projected.daily).toBe(3);
  });
});

describe("computeStreak — weekly", () => {
  it("4/7 days → no badge", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"], // Mon-Thu W21
      freezeDays: [],
      timezone: TZ,
      now: new Date("2026-05-24T12:00:00Z"), // Sunday end of W21
    });
    expect(r.weekly).toBe(0);
    expect(r.daysThisWeek).toBe(4);
  });

  it("5/7 days this week → weekly 1", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21", "2026-05-22"],
      freezeDays: [],
      timezone: TZ,
      now: new Date("2026-05-24T12:00:00Z"),
    });
    expect(r.weekly).toBe(1);
    expect(r.daysThisWeek).toBe(5);
  });
});

describe("computeStreak — freezes available", () => {
  it("0 freezes used this month → 2 available", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-25"],
      freezeDays: [],
      timezone: TZ,
      now: NOW,
    });
    expect(r.freezesUsedThisMonth).toBe(0);
    expect(r.freezesAvailable).toBe(2);
  });

  it("2 freezes used this month → 0 available", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-25"],
      freezeDays: ["2026-05-10", "2026-05-15"],
      timezone: TZ,
      now: NOW,
    });
    expect(r.freezesUsedThisMonth).toBe(2);
    expect(r.freezesAvailable).toBe(0);
  });

  it("freezes from a previous month don't count", () => {
    const r = computeStreak({
      reviewDays: ["2026-05-25"],
      freezeDays: ["2026-04-30"],
      timezone: TZ,
      now: NOW,
    });
    expect(r.freezesUsedThisMonth).toBe(0);
  });
});
