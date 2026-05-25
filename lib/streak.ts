// Pure streak computation. No DB, no Date.now() side effects.
//
// Caller supplies arrays of "day keys" (YYYY-MM-DD strings in user TZ) for
// ReviewLog days and StreakFreeze days. Returned numbers are display-ready.

import { dayKey, weekKey, addDays } from "./timezone";

export interface ComputeArgs {
  /** Distinct day keys (YYYY-MM-DD in user TZ) on which the user reviewed. Most-recent first OK; we re-sort. */
  reviewDays: string[];
  /** Distinct day keys on which a freeze was used. */
  freezeDays: string[];
  /** IANA timezone name. */
  timezone: string;
  /** Now. */
  now: Date;
  /**
   * Optional: day keys to *treat as active* without writing them. Used by /today to
   * preview the streak the user would have if they grade today.
   * computeStreak does NOT write anything; this is display-only.
   */
  assumeActiveDays?: string[];
}

export interface StreakResult {
  daily: number;
  longest: number;
  weekly: number;
  daysThisWeek: number;
  lastReviewed: string | null;
  freezesUsedThisMonth: number;
  freezesAvailable: number;
}

export function computeStreak(args: ComputeArgs): StreakResult {
  const today = dayKey(args.now, args.timezone);
  const currentWeek = weekKey(args.now, args.timezone);

  // Active = review OR freeze OR assumed.
  const activeSet = new Set<string>([
    ...args.reviewDays,
    ...args.freezeDays,
    ...(args.assumeActiveDays ?? []),
  ]);

  // Daily streak: walk back from `today` while each day is in activeSet.
  let cursor = today;
  let daily = 0;
  while (activeSet.has(cursor)) {
    daily += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest streak: scan sorted unique days, count max consecutive run.
  let longest = 0;
  const sortedActive = [...activeSet].sort();
  let runStart = -1;
  for (let i = 0; i < sortedActive.length; i++) {
    if (i === 0 || addDays(sortedActive[i - 1], 1) !== sortedActive[i]) {
      runStart = i;
    }
    longest = Math.max(longest, i - runStart + 1);
  }

  // Weekly badge: a week earns the badge if reviews happened on >=5 distinct days
  // (ignoring freezes — the badge is about effort, not retention).
  const reviewByWeek = new Map<string, Set<string>>();
  for (const d of args.reviewDays) {
    // We need to recover the date object from the day key (UTC midnight) to compute its week.
    // Reuse the same logic: weekKey takes a Date; build one from the key string.
    const [y, m, dd] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd, 12, 0, 0));
    const wk = weekKey(dt, args.timezone);
    if (!reviewByWeek.has(wk)) reviewByWeek.set(wk, new Set());
    reviewByWeek.get(wk)!.add(d);
  }
  const daysThisWeek = reviewByWeek.get(currentWeek)?.size ?? 0;

  // Weekly streak: count consecutive weeks back from currentWeek meeting the >=5 bar.
  // (Current week counts only if it already has >=5 days, which is rare mid-week.)
  let weekly = 0;
  let wkCursor = currentWeek;
  while (true) {
    const sz = reviewByWeek.get(wkCursor)?.size ?? 0;
    if (sz < 5) break;
    weekly += 1;
    wkCursor = prevWeekKey(wkCursor);
  }

  const lastReviewed = args.reviewDays.length ? [...args.reviewDays].sort().at(-1)! : null;

  // Freezes used this calendar month (in user TZ).
  const monthPrefix = today.slice(0, 7); // "YYYY-MM"
  const freezesUsedThisMonth = args.freezeDays.filter((d) => d.startsWith(monthPrefix)).length;
  const freezesAvailable = Math.max(0, 2 - freezesUsedThisMonth);

  return {
    daily,
    longest,
    weekly,
    daysThisWeek,
    lastReviewed,
    freezesUsedThisMonth,
    freezesAvailable,
  };
}

// "2026-W22" → "2026-W21" (or "2025-W52"/"2025-W53" across year boundary).
function prevWeekKey(wk: string): string {
  // Find the Monday of `wk`, subtract 7 days, recompute weekKey at noon UTC for stability.
  const [yStr, wStr] = wk.split("-W");
  const y = Number(yStr);
  const w = Number(wStr);
  // ISO week 1 contains Jan 4. Find its Monday.
  const jan4 = new Date(Date.UTC(y, 0, 4, 12, 0, 0));
  const jan4Dow = ((jan4.getUTCDay() + 6) % 7) + 1; // 1..7
  const week1Monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86_400_000);
  const monday = new Date(week1Monday.getTime() + (w - 1) * 7 * 86_400_000);
  const prevMonday = new Date(monday.getTime() - 7 * 86_400_000);
  return weekKey(prevMonday, "UTC");
}
