// SM-2 scheduler with deterministic ±15% interval fuzz.
//
// Grade mapping (matches Anki's four-button UX):
//   0 = Again, 1 = Hard, 2 = Good, 3 = Easy
//
// Reference: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
//
// Fuzz: the post-SM-2 intervalDays is jittered by ±15% via a deterministic
// hash of (cardId, reps). Same (cardId, reps) → same multiplier. Cards that
// would all otherwise pile on Monday spread across Sat/Sun/Mon/Tue.
// Fuzz never produces a negative interval (clamped to 0 when SM-2 returned 0).

export type Grade = 0 | 1 | 2 | 3;

export interface CardState {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface Scheduled extends CardState {
  dueAt: Date;
  lastReviewedAt: Date;
}

export interface ScheduleContext {
  cardId: string;
  now?: Date;
  /** Override for tests; ignore for production. */
  disableFuzz?: boolean;
}

const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;
const FUZZ_AMPLITUDE = 0.15;

export function schedule(state: CardState, grade: Grade, ctx: ScheduleContext): Scheduled {
  const now = ctx.now ?? new Date();
  let { ease, intervalDays, reps, lapses } = state;

  if (grade === 0) {
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

    const deltas = { 1: -0.15, 2: 0, 3: 0.15 } as const;
    ease = Math.max(MIN_EASE, ease + deltas[grade]);
  }

  // Fuzz (skipped when intervalDays is 0 — no point jittering "due now").
  if (!ctx.disableFuzz && intervalDays > 0) {
    intervalDays = applyFuzz(intervalDays, ctx.cardId, reps);
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

// Deterministic hash → multiplier in [1 - amp, 1 + amp].
function applyFuzz(interval: number, cardId: string, reps: number): number {
  const seed = `${cardId}:${reps}`;
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const u = (h >>> 0) / 0xffffffff; // [0, 1)
  const mult = 1 + (u * 2 - 1) * FUZZ_AMPLITUDE; // [1-amp, 1+amp]
  return Math.max(0, interval * mult);
}

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
