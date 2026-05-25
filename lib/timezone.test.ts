import { describe, it, expect } from "vitest";
import { dayKey, weekKey, startOfMonth, parseDayKey, daysBetween, addDays } from "./timezone";

describe("dayKey", () => {
  it("UTC: noon", () => {
    expect(dayKey(new Date("2026-05-25T12:00:00Z"), "UTC")).toBe("2026-05-25");
  });

  it("UTC: midnight boundary", () => {
    expect(dayKey(new Date("2026-05-25T00:00:00Z"), "UTC")).toBe("2026-05-25");
    expect(dayKey(new Date("2026-05-24T23:59:59Z"), "UTC")).toBe("2026-05-24");
  });

  it("America/Chicago: late-evening rollover", () => {
    // 03:00 UTC = 22:00 prev day Chicago (CDT, UTC-5)
    expect(dayKey(new Date("2026-05-25T03:00:00Z"), "America/Chicago")).toBe("2026-05-24");
    expect(dayKey(new Date("2026-05-25T06:00:00Z"), "America/Chicago")).toBe("2026-05-25");
  });

  it("Asia/Kolkata: half-hour offset", () => {
    // 18:31 UTC = 00:01 next day IST (UTC+5:30)
    expect(dayKey(new Date("2026-05-25T18:31:00Z"), "Asia/Kolkata")).toBe("2026-05-26");
  });

  it("Pacific/Kiritimati: date-line crossing", () => {
    // UTC+14
    expect(dayKey(new Date("2026-05-25T11:00:00Z"), "Pacific/Kiritimati")).toBe("2026-05-26");
  });
});

describe("weekKey", () => {
  it("returns a Monday-anchored ISO week", () => {
    // 2026-05-25 is a Monday → start of week 22. Per ISO: Thursday's year is 2026.
    expect(weekKey(new Date("2026-05-25T12:00:00Z"), "UTC")).toBe("2026-W22");
    // 2026-05-24 (Sunday) belongs to week 21
    expect(weekKey(new Date("2026-05-24T12:00:00Z"), "UTC")).toBe("2026-W21");
  });

  it("year boundary: Jan 1 belongs to last year's W53 when Thursday is in prior year", () => {
    // 2027-01-01 is a Friday. Its Monday is 2026-12-28, Thursday is 2026-12-31 → ISO week is 2026-W53
    expect(weekKey(new Date("2027-01-01T12:00:00Z"), "UTC")).toBe("2026-W53");
  });
});

describe("startOfMonth", () => {
  it("returns first-of-month key", () => {
    expect(startOfMonth(new Date("2026-05-25T12:00:00Z"), "UTC")).toBe("2026-05-01");
  });
});

describe("parseDayKey + addDays + daysBetween", () => {
  it("parseDayKey yields UTC midnight", () => {
    const d = parseDayKey("2026-05-25");
    expect(d.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  it("addDays handles month rollover", () => {
    expect(addDays("2026-05-30", 3)).toBe("2026-06-02");
  });

  it("addDays handles year rollover", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("daysBetween excludes start, includes end", () => {
    expect(daysBetween("2026-05-23", "2026-05-25")).toEqual(["2026-05-24", "2026-05-25"]);
  });

  it("daysBetween empty when end == start", () => {
    expect(daysBetween("2026-05-25", "2026-05-25")).toEqual([]);
  });

  it("daysBetween empty when end < start", () => {
    expect(daysBetween("2026-05-25", "2026-05-23")).toEqual([]);
  });
});
