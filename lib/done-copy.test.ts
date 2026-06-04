import { describe, it, expect } from "vitest";
import { selectDoneState } from "./done-copy";

const NOW = new Date("2026-05-25T12:00:00Z");

describe("selectDoneState", () => {
  it("A: no cards", () => {
    const r = selectDoneState({
      hasAnyCards: false,
      hasAnyActiveCard: true,
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
      hasAnyActiveCard: true,
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
      hasAnyActiveCard: true,
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
      hasAnyActiveCard: true,
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
      hasAnyActiveCard: true,
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
      hasAnyActiveCard: true,
      excessDueToday: 2,
      dueSoonCount: 3,
      nextDueAt: nextDue,
      now: NOW,
    });
    expect(r.variant).toBe("B");
  });
});

describe("zero-active group state", () => {
  it("shows the activate-a-group copy when initialized with no active cards", () => {
    const state = selectDoneState({
      hasAnyCards: true,
      hasAnyActiveCard: false,
      excessDueToday: 0,
      dueSoonCount: 0,
      nextDueAt: null,
      now: new Date("2026-06-04T12:00:00Z"),
    });
    expect(state.copy).toMatch(/no active group/i);
    expect(state.showGroupsCta).toBe(true);
  });

  it("does not show the groups CTA when there are active cards due soon", () => {
    const state = selectDoneState({
      hasAnyCards: true,
      hasAnyActiveCard: true,
      excessDueToday: 0,
      dueSoonCount: 3,
      nextDueAt: new Date("2026-06-05T12:00:00Z"),
      now: new Date("2026-06-04T12:00:00Z"),
    });
    expect(state.showGroupsCta).toBeFalsy();
  });
});
