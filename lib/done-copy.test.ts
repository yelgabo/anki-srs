import { describe, it, expect } from "vitest";
import { selectDoneState } from "./done-copy";

const NOW = new Date("2026-05-25T12:00:00Z");

describe("selectDoneState", () => {
  it("A: no cards", () => {
    const r = selectDoneState({
      hasAnyCards: false,
      excessDueToday: 0,
      dueSoonCount: 0,
      nextDueAt: null,
      now: NOW,
    });
    expect(r.variant).toBe("A");
    expect(r.showDueSoonCta).toBe(false);
  });

  it("B: cap-overflow today", () => {
    const r = selectDoneState({
      hasAnyCards: true,
      excessDueToday: 3,
      dueSoonCount: 0,
      nextDueAt: null,
      now: NOW,
    });
    expect(r.variant).toBe("B");
    expect(r.copy).toContain("+3 more due today");
    expect(r.showDueSoonCta).toBe(false);
  });

  it("C: due-soon with next-due", () => {
    const nextDue = new Date("2026-05-27T12:00:00Z");
    const r = selectDoneState({
      hasAnyCards: true,
      excessDueToday: 0,
      dueSoonCount: 5,
      nextDueAt: nextDue,
      now: NOW,
    });
    expect(r.variant).toBe("C");
    expect(r.copy).toContain("Next: 5 due");
    expect(r.showDueSoonCta).toBe(true);
  });

  it("D: no due-soon, next-due > 3d out", () => {
    const nextDue = new Date("2026-06-01T12:00:00Z");
    const r = selectDoneState({
      hasAnyCards: true,
      excessDueToday: 0,
      dueSoonCount: 0,
      nextDueAt: nextDue,
      now: NOW,
    });
    expect(r.variant).toBe("D");
    expect(r.copy).toContain("Next review");
    expect(r.showDueSoonCta).toBe(false);
  });

  it("E: has cards but nothing scheduled", () => {
    const r = selectDoneState({
      hasAnyCards: true,
      excessDueToday: 0,
      dueSoonCount: 0,
      nextDueAt: null,
      now: NOW,
    });
    expect(r.variant).toBe("E");
    expect(r.showDueSoonCta).toBe(false);
  });

  it("B takes precedence over C (cap-overflow + due-soon)", () => {
    const nextDue = new Date("2026-05-27T12:00:00Z");
    const r = selectDoneState({
      hasAnyCards: true,
      excessDueToday: 2,
      dueSoonCount: 3,
      nextDueAt: nextDue,
      now: NOW,
    });
    expect(r.variant).toBe("B");
  });
});
