// SM-2 scheduler. Pure function; pass `now` for testability.
//
// Grade mapping (matches Anki's four-button UX):
//   0 = Again, 1 = Hard, 2 = Good, 3 = Easy
//
// Reference: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method

export type Grade = 0 | 1 | 2 | 3;

export interface CardState {
  ease: number;          // ease factor, >= 1.3
  intervalDays: number;  // interval in days, fractional ok
  reps: number;          // total successful reps
  lapses: number;        // number of times graded Again
}

export interface Scheduled extends CardState {
  dueAt: Date;
  lastReviewedAt: Date;
}

const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function schedule(state: CardState, grade: Grade, now: Date = new Date()): Scheduled {
  let { ease, intervalDays, reps, lapses } = state;

  if (grade === 0) {
    // Again: reset interval, count lapse, drop ease.
    lapses += 1;
    reps = 0;
    intervalDays = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    reps += 1;

    if (reps === 1) {
      intervalDays = grade === 1 ? 0.5 : grade === 2 ? 1 : 3;
    } else if (reps === 2) {
      intervalDays = grade === 1 ? 3 : grade === 2 ? 6 : 10;
    } else {
      const mult = grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3;
      intervalDays = intervalDays * mult;
    }

    // SM-2 ease adjustment (Anki-style deltas).
    const deltas = { 1: -0.15, 2: 0, 3: 0.15 } as const;
    ease = Math.max(MIN_EASE, ease + deltas[grade]);
  }

  const dueAt = new Date(now.getTime() + intervalDays * DAY_MS);

  return {
    ease: round(ease, 3),
    intervalDays: round(intervalDays, 3),
    reps,
    lapses,
    dueAt,
    lastReviewedAt: now,
  };
}

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
