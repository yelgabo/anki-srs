# M2 — Daily review queue + streak (expanded)

**Status:** DRAFT v2 — revised after iteration-1 review (product, security, architecture)
**Source PRD:** [`../../../../.claude/prds/coding-problem-srs.prd.md`](../../../../.claude/prds/coding-problem-srs.prd.md)
**Scope:** Milestone M2 of the SRS-for-coding-problems product. Adds an explicit session model and the retention levers serious SRS users expect — interval fuzz, soft cap, skip, undo, keyboard shortcuts, leech detection, daily+weekly streaks with freezes.
**Out of scope (deferred):** Import problems from URL via LLM → M2.5 (separate spec, requires SSRF defenses + USD cost ledger + prompt-injection hardening + non-shared Problem ownership). User-visible leech UI deferred (data captured in M2; UI lands later). CSP / HSTS headers tracked but deferred (no exposure path in M2).

## Summary

`/today` becomes the primary entry point for an authenticated user. It shows the due count, a daily streak (with up to 2 freezes per calendar month), a weekly badge (consecutive weeks with ≥5 review days), and a "Start session" CTA. Clicking it enters `/review` — a pure card-rendering primitive — which loops through due cards until the queue is drained, then redirects back to `/today` whose inline "done" state shows context-appropriate copy and a "Review N due soon" CTA. SRS gets interval fuzz, a per-user soft daily cap, in-session skip, undo-within-30s, keyboard shortcuts, leech detection, and per-user rate-limited grade/undo actions.

## Architecture

```
NEW or MODIFIED for M2:

app/
├── today/
│   ├── page.tsx              # NEW — queue view AND inline done state (one screen, two states)
│   └── actions.ts            # NEW — server action: startSession (clears m2_skip cookie, redirects /review)
├── review/
│   ├── page.tsx              # MODIFIED — primitive: renders ONE card; on empty pick, redirects /today
│   ├── ReviewCard.tsx        # MODIFIED — see §6 keyboard, +Skip button calling skipAction
│   └── actions.ts            # MODIFIED — gradeCard body REPLACED (see Composition flow);
│                             #              +skipAction (appends to m2_skip cookie)
├── api/user/timezone/route.ts # NEW — POST endpoint; auth-gated; rate-limited 1/min/user
└── components/UndoButton.tsx # NEW — shared server component rendered in /review + /today headers
                              #       Calls auth() defensively; returns null if no session.
                              #       Queries eligible ReviewLog (filtered by session.user.id);
                              #       renders button or nothing.
                              #       Action: undoAction (in app/review/actions.ts)

lib/
├── streak.ts                 # NEW — pure: computeStreak({ reviewDays, freezeDays, timezone, now, assumeActiveDays? })
│                             #            → { daily, longest, weekly, daysThisWeek, lastReviewed,
│                             #                freezesUsedThisMonth, freezesAvailable }
├── srs.ts                    # MODIFIED — schedule(state, grade, { cardId, now }) with deterministic ±15% fuzz
├── timezone.ts               # NEW — dayKey(date, tz), weekKey(date, tz), startOfMonth(now, tz)
├── signed-cookie.ts          # NEW — sign(payload) → b64, verify(token) → payload | null
│                             #       HMAC-SHA256 over AUTH_SECRET; payload = { userId, ids[], iat }
└── (rate-limit.ts used as-is)

prisma/schema.prisma          # +User.timezone, +User.dailyReviewCap
                              # +Card.lapses tracked already; +Card.leech Boolean @default(false)
                              # +ReviewLog.prevReps, +ReviewLog.prevLapses, +ReviewLog.prevLastReviewedAt
                              # +StreakFreeze table
                              # NO Problem changes (deferred to M2.5)

components/
└── ReviewCard.tsx            # MODIFIED — keyboard shortcuts (window listener),
                              # inline hint row, undo button + skip button
```

### Key boundary decisions

- **`/review` always redirects on empty.** When the picker returns null, it `redirect("/today")`. It never renders a "no card" state of its own. `/today` is the only surface for done-state UX.
- **`/today/done` is not a route.** Done state is an inline render mode of `/today` when `dueCount === 0`.
- **Streak math is a pure function.** Two DB reads per page load (review-day keys and freeze-day keys, both LIMIT 400, both filtered by user); pure `computeStreak` reduces them. No retained streak counters in DB.
- **Timezone capture is opportunistic.** Client reads `Intl.DateTimeFormat().resolvedOptions().timeZone` after first authenticated page load and POSTs once. Default `"UTC"`; one-day-off worst case until set.
- **Defensive `ensureCards` filter is deferred to M2.5.** All current `Problem` rows are curated; the bug isn't live. M2.5 adds the filter when it adds user imports.

## Streak design

Two metrics visible on `/today`: a daily streak with auto-freezes (primary chip) and a weekly badge (secondary chip).

### Daily streak with auto-freezes

- `dailyStreak` = count of consecutive days, in the user's timezone, with at least one ReviewLog row OR a `StreakFreeze` row covering that day.
- Users earn 2 freezes per calendar month. Freezes are auto-spent — never manually consumed, never user-visible as inventory.
- `freezesUsedThisMonth` = count of `StreakFreeze` rows where `usedOn` falls inside the current calendar month in the user's timezone. When this is 2, the next missed day breaks the streak.

### Weekly badge

- A week (Mon–Sun in user TZ) earns the badge if reviews happened on ≥5 distinct days.
- `weeklyBadgeStreak` = count of consecutive weeks back from this week meeting the bar.
- Current-week progress shown as `daysThisWeek / 5`.

### Freeze grant trigger (eager, in transaction, race-safe)

Freezes are *created* on the user's first grade action of a new day, in the same transaction that writes the ReviewLog. Pseudo:

```
$transaction(async (tx) => {                                    // callback form required for reads-then-conditional-writes
  // 1. Lock the user row to serialize freeze grants for this user
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${uid} FOR UPDATE`;

  // 2. Determine missed days
  const today = dayKey(now, user.timezone);
  const lastActiveDay = await tx.$queryRaw`
    SELECT MAX(d) FROM (
      SELECT (date_trunc('day', "reviewedAt" AT TIME ZONE ${tz}))::date AS d
        FROM "ReviewLog" WHERE "userId" = ${uid}
      UNION ALL
      SELECT "usedOn" AS d FROM "StreakFreeze" WHERE "userId" = ${uid}
    ) AS x
  `;
  if (lastActiveDay is null || lastActiveDay >= today - 1 day) {
    // streak intact — no freeze needed
  } else {
    const missed = days from lastActiveDay+1 through today-1;
    const used = await tx.streakFreeze.count({
      where: { userId, usedOn: { gte: startOfMonth(now, tz), lt: startOfNextMonth(now, tz) } }
    });
    const available = 2 - used;
    for (const day of missed.slice(0, available)) {
      await tx.streakFreeze.upsert({                            // upsert handles unique-constraint races defensively
        where:  { userId_usedOn: { userId, usedOn: day } },
        create: { userId, usedOn: day },
        update: {},
      });
    }
    // any remaining missed days are uncovered → streak resets when computeStreak sees the gap
  }

  // 3. The grade itself
  await tx.card.update({ ... });
  await tx.reviewLog.create({ ... });
});
```

- `SELECT ... FOR UPDATE` on the User row serializes concurrent grant attempts for the same user — closes the read-then-write race that could grant a 3rd freeze. Postgres at Read Committed honors this lock.
- `upsert` on `(userId, usedOn)` is defense-in-depth via the `@@unique` constraint; the FOR UPDATE handles correctness, the upsert handles defense-in-depth.
- The entire transaction is one atomic unit. If anything fails, none of the writes apply.

### Streak display before any grade today

`/today` computes streak *and* hypothetical freeze coverage at page load — before any grade — but presents the result honestly so the user isn't misled into thinking they've already done their work.

Display logic:
- Compute the streak twice. Once with **actual** ReviewLog + StreakFreeze data (`actualStreak`). Once with a hypothetical `assumeActiveDays: [today]` plus the hypothetical freeze grants that *would* fire if the user grades today (`projectedStreak`).
- If `projectedStreak === actualStreak`, render `actualStreak`.
- If `projectedStreak > actualStreak` (today is a new active day OR a gap is coverable by available freezes), render: `actualStreak` with a small **"+1 if you review today"** hint chip beneath it (or "+1 with auto-freeze if you review today" when freezes are involved).

No freeze rows are written until the user actually grades. The hint chip is the entire "aspirational vs earned" honesty signal.

`computeStreak` signature: `computeStreak({ reviewDays, freezeDays, timezone, now, assumeActiveDays? }) → { ... }`. Caller decides whether to inject hypothetical days.

## SRS + queue mechanics

### 1. Interval fuzz in `lib/srs.ts`

On every reschedule, jitter `intervalDays` by `±15%`. Seed: deterministic from `(cardId, reps)` so the same card always lands on the same day for the same user (no flicker), but cards otherwise piling on one day spread across a few. Signature: `schedule(state, grade, { cardId, now })`. Fuzz applies after the SM-2 multiplier; never produces negative intervals (clamped at 0).

### 2. Soft daily cap (`User.dailyReviewCap Int @default(50)`)

`/today` shows up to `dailyReviewCap` due cards in the session. Excess due cards remain due (their `dueAt` is unchanged) — shown below the CTA as **"+N more due. [Review them anyway →]"** where the link enters `/review?force=1`. With `force=1`, `/review` ignores the cap for this session.

### 3. "Review N due soon" when due=0

When `dueCount === 0` AND the user has any cards at all, render a secondary CTA: **"Review 5 due soon"**. Picker: `findMany` with `where: { userId, dueAt: { gt: now, lte: now + 3 days } }`, `orderBy: [{ dueAt: 'asc' }, { id: 'asc' }]`, `take: 5`. These cards get graded normally — SM-2 will mildly compress their next interval, which is acceptable because they were nearly due anyway. Enters `/review?ahead=5`.

(Decision: rejected the original "longest-interval" pick because grading non-due best-retained cards distorts their schedule downward — actively harmful to SRS. Near-due cards minimize distortion while preserving the engagement loop.)

### 4. Undo last grade (per-user, 30s window, persists across cards)

Undo button renders in the page header **on both `/review` and `/today`** so it survives transitioning between cards and back to the home view. Visible whenever a `ReviewLog` row exists for this user with `reviewedAt > now - 30s`. Implementation: a shared `<UndoButton>` server component that queries for the most-recent eligible ReviewLog and renders the button iff one exists.

Action:
1. Find most-recent ReviewLog for `userId` with `reviewedAt > now - 30s`: `findFirst({ where: { userId, reviewedAt: { gt: thirtySecondsAgo } }, orderBy: { reviewedAt: 'desc' } })`.
2. Inside `$transaction`:
   - Restore `Card.intervalDays`, `ease`, `reps`, `lapses`, `dueAt`, `lastReviewedAt` from the row's `prev*` fields.
   - Delete the ReviewLog row.
   - Recompute `Card.leech` (`leech = lapses >= 8`).
3. `revalidatePath("/review")` and `/today`.

If no row qualifies, redirect to `/review?error=cant_undo` with a transient toast.

Rate-limited: 30 undos/minute/user via the existing `rateLimit` helper.

### 5. Skip / postpone (mid-session)

`<ReviewCard>` exposes a "Skip" button (keyboard: `s`). Skip does **not** write a ReviewLog. Skipped card IDs are tracked in a **signed, HTTP-only, session-scoped cookie** named `m2_skip` set by a server action.

- On "Start session" (entry to `/review` from `/today`): server action clears the cookie.
- On "Skip" click: server action appends the current card ID to the cookie value (comma-separated cuids), capped at 32 entries with FIFO trim.
- Server picker reads the cookie via `cookies()` in `app/review/page.tsx` and applies `where: { id: { notIn: skipped } }`.
- Cookie value is the base64-encoded JSON `{ userId, ids: string[], iat: number }` with HMAC-SHA256 over `AUTH_SECRET` appended. Helpers live in `lib/signed-cookie.ts` (`sign(payload) → token`, `verify(token) → payload | null`).
- On read: `verify()` returns null if the signature fails OR if `payload.userId !== session.user.id` (stale cookie from a prior account). Null → empty skip set.
- AUTH_SECRET rotation invalidates all in-flight skip cookies — acceptable; no security impact, just session resets.

Why a cookie over `/review?skipped=...` (the original proposal):
- URL query strings leak card IDs into browser history and (potentially) third-party referers via outbound link clicks.
- Cookies are HTTP-only, scoped to this app's origin, and don't appear in `Referer` headers to external sites.
- Still no new infra — same Next.js `cookies()` API used elsewhere.

If 32 distinct cards are skipped in one session (unlikely in normal use), the oldest skipped ID is evicted and that card becomes pickable again.

### 6. Keyboard shortcuts on `<ReviewCard>`

Attach a single `window` keydown listener inside `<ReviewCard>` via `useEffect` (with cleanup). For each event:
1. If `event.target` (or activeElement) is `<input>`, `<textarea>`, or a contentEditable element, **no-op** (do not preventDefault — let the user type).
2. Otherwise, dispatch on `event.key`:
   - `" "` (Space) → reveal approach (if hidden); else no-op.
   - `"1"` / `"2"` / `"3"` / `"4"` → grade Again/Hard/Good/Easy (only after reveal).
   - `"s"` → Skip (works pre- or post-reveal).
   - `"u"` → Undo (if eligible).
3. Only call `event.preventDefault()` **when one of the handled keys above was matched**, never unconditionally — this preserves Tab, Cmd-R, screen-reader keys, and all other browser/system shortcuts.

Inline hint row (`Space · 1 · 2 · 3 · 4 · s · u`) shown beneath the button row for the first three sessions per user (tracked via `localStorage` key `shortcut-hints-seen` storing a counter).

### 7. Leech detection (data only in M2)

`Card.leech Boolean @default(false)`. On grade, after applying SM-2, if `lapses >= 8` set `leech = true` in the same transaction. No UI surface in M2 — just data capture so M3+ can offer "suspend leeches" actions. Why now: backfilling later requires scanning every Card; capturing now is two extra lines in the grade action.

### Composition flow

```
GET /today:
  authn or redirect /signin
  load due cards (where dueAt <= now AND userId), order by [dueAt asc, id asc], take dailyReviewCap
  count excess due = (full due count) - (taken count)
  load streak twice: actual + projected (with assumeActiveDays=[today])
  load "due-soon" candidates (where dueAt in (now, now+3d] AND userId)
  load next dueAt for any future card (min dueAt where dueAt > now)
  render {
    streak chip + "+1 if you review today" hint when projected > actual,
    weekly badge chip,
    <UndoButton/> in header if eligible ReviewLog row exists,
    if dueCount > 0: "Start session" CTA + due chip + (overflow line if excess > 0),
    else: done-state copy variant A/C/D/E (see table) + "Review M due soon" CTA when applicable
  }

POST /today/start-session:                              // server action, clears m2_skip cookie
  cookies().delete("m2_skip")
  redirect /review

GET /review:
  authn or redirect /signin
  parse ?ahead=N, ?force=1
  read skipped IDs from m2_skip cookie
  pick next:
    if ahead > 0: pick from due-soon (dueAt in (now, now+3d]), exclude skipped
    else if force: pick from due (dueAt <= now), exclude skipped, ignore cap
    else: pick from due (dueAt <= now), exclude skipped, take 1
    tiebreak everywhere: orderBy [{ dueAt: 'asc' }, { id: 'asc' }]
  if no card: redirect /today
  render <ReviewCard> + <UndoButton/> in header (if eligible)

POST /review/skip(formData):                            // server action
  authn or redirect /signin
  read m2_skip cookie; append cardId; FIFO trim to 32; re-sign and set cookie
  revalidatePath /review                                // /review re-renders with next card

POST grade(formData):  // REPLACES the existing gradeCard body in app/review/actions.ts
  authn or redirect /signin
  rateLimit(`grade:user:${userId}`, 120/min)
  validate card belongs to user                         // card.userId === session.user.id
  $transaction(async tx):
    SELECT id FROM "User" WHERE id = $userId FOR UPDATE  // serialize freeze grants for this user
    compute & apply freeze grants if first-of-day after gap
    next = schedule(state, grade, { cardId, now })       // SM-2 with fuzz
    tx.card.update({ ease, intervalDays, reps, lapses, dueAt, lastReviewedAt: now,
                     leech: next.lapses >= 8 })
    tx.reviewLog.create({ cardId, userId, grade,
                          prevInterval, newInterval, prevEase, newEase,    // existing fields
                          prevReps, prevLapses, prevLastReviewedAt })       // new fields
  revalidatePath /review
  // If picker exhausts due (or ahead) cards on next page render, /review redirects /today

POST undo(formData):
  authn or redirect /signin
  rateLimit(`undo:user:${userId}`, 30/min)
  $transaction(async tx):
    SELECT id FROM "User" WHERE id = $userId FOR UPDATE
    row = find most-recent ReviewLog (userId, reviewedAt > now-30s)
    if none: redirect /review?error=cant_undo
    tx.card.update({                                    // restore from prev* (handles first-review null)
      ease: row.prevEase, intervalDays: row.prevInterval, reps: row.prevReps,
      lapses: row.prevLapses, dueAt: <recompute from prevInterval + prevLastReviewedAt>,
      lastReviewedAt: row.prevLastReviewedAt,            // null when first review
      leech: row.prevLapses >= 8 })
    tx.reviewLog.delete({ where: { id: row.id } })
  revalidatePath /review and /today
```

**Note (Postgres-only):** `SELECT ... FOR UPDATE` semantics require a real Postgres backend. SQLite (sometimes used for local dev) silently ignores the lock — local concurrency tests will pass deceptively. The project uses Postgres in both Railway (production) and local dev via the Railway public URL, so this is fine; document it so future contributors don't switch.

**Note (single-replica rate limiting):** All `rateLimit()` calls in M2 (grade, undo, timezone) rely on the in-process LRU token bucket in `lib/rate-limit.ts`, which requires `numReplicas=1` on Railway. Scaling out silently weakens these limits. Already documented in `lib/rate-limit.ts:4`; called out here at the point of use.

### Done-state copy variants

`/today` done state branches on `(hasAnyCards, hasDueSoon, nextDueAt)`. `hasDueSoon` = at least one card with `dueAt ∈ (now, now + 3 days]`.

| # | Condition | Copy |
|---|---|---|
| A | No Cards at all | "No cards in your deck yet." |
| B | Has Cards, due today *overflow only* (cap exhausted but more remain due today) | `"+N more due today. [Review them anyway →]"` |
| C | Has Cards, has due-soon, nothing today | `"Next: N due {short date}"` + `[Review M due soon →]` |
| D | Has Cards, no due-soon, next due > 3 days out | `"Next review: {short date}"` (no Review-ahead CTA) |
| E | Has Cards, no next due at all (never scheduled, all suspended/leech, edge case) | "All caught up — nothing scheduled." |

The order matters: B is checked before C/D/E because cap-overflow today is the strongest signal. `(hasAnyCards=true, hasDueSoon=false, nextDueAt > 3d)` (case D) was missing from the original spec and is now explicit.

## Schema

Additive only. `prisma db push` runs clean on the live DB (currently 0 users, 5 problems post-wipe).

**Existing fields preserved (already in schema from M1):** `Card.lastReviewedAt`, `Card.ease`, `Card.intervalDays`, `Card.reps`, `Card.lapses`, `Card.dueAt`. `ReviewLog.prevInterval`, `ReviewLog.newInterval`, `ReviewLog.prevEase`, `ReviewLog.newEase`, `ReviewLog.grade`, `ReviewLog.reviewedAt`. Undo restores `Card` from the union of existing `prev*` fields and the new `prev*` fields added below.

**Additions in M2 (all default-bearing or nullable → `prisma db push` is non-destructive):**

```prisma
model User {
  // existing fields...
  timezone        String  @default("UTC")     // IANA, e.g. "America/Chicago"
  dailyReviewCap  Int     @default(50)

  streakFreezes   StreakFreeze[]
}

model Card {
  // existing fields...
  leech           Boolean @default(false)     // lapses >= 8; M2 captures data, M3+ surfaces UI
}

model ReviewLog {
  // existing prevInterval, newInterval, prevEase, newEase, grade, reviewedAt remain unchanged.
  prevReps             Int       @default(0)  // NEW — restore reps on undo of Again grade
  prevLapses           Int       @default(0)  // NEW — restore lapses on undo of Again grade
  prevLastReviewedAt   DateTime?              // NEW — restore lastReviewedAt on undo without a 2nd query
                                              //       Null when this was the first review of the card.

  @@index([userId, reviewedAt])               // NEW — supports <UndoButton> findFirst on every page render
                                              //       (filters by userId AND reviewedAt > now - 30s)
}

model StreakFreeze {
  id        String   @id @default(cuid())
  userId    String
  usedOn    DateTime @db.Date                 // the day (in user TZ) this freeze covered
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, usedOn])                  // one freeze per user per day; backs the upsert idempotency
  @@index([userId, usedOn])
}
```

Notes:
- All additions have defaults so `db push` is non-destructive on existing rows.
- `StreakFreeze.usedOn` is `@db.Date` — the server constructs date-only values from `User.timezone` to avoid DST shifts on insert. Insertion path: build a `Date` from the year/month/day-of-month in user TZ, then store; Postgres preserves the calendar date regardless of UTC offset.

## Data-access patterns

**All Prisma calls in M2 filter by `session.user.id` from `auth()` — no exceptions.** Cross-user reads are not part of M2's surface.

**Streak queries use `$queryRaw` with tagged-template parameters** (NOT `$queryRawUnsafe`). The timezone string is bound as a parameter:

```ts
const reviewDays = await prisma.$queryRaw<{ d: Date }[]>`
  SELECT DISTINCT (date_trunc('day', "reviewedAt" AT TIME ZONE ${user.timezone}))::date AS d
  FROM "ReviewLog"
  WHERE "userId" = ${user.id}
  ORDER BY d DESC
  LIMIT 400
`;
const freezeDays = await prisma.$queryRaw<{ d: Date }[]>`
  SELECT "usedOn" AS d FROM "StreakFreeze" WHERE "userId" = ${user.id} ORDER BY d DESC LIMIT 400
`;
```

`User.timezone` is validated against `Intl.supportedValuesOf("timeZone")` on the POST endpoint (see below); reads downstream trust the stored value.

**`POST /api/user/timezone`:**
- `auth()` required; 401 if no session.
- Body parsed via `z.object({ timezone: z.string() }).refine(t => Intl.supportedValuesOf("timeZone").includes(t.timezone))`.
- Writes `prisma.user.update({ where: { id: session.user.id }, data: { timezone } })` — `where` always scopes to the session user.
- `rateLimit(\`tz:user:${session.user.id}\`, 1 per 60_000)` — throwaway endpoint, throttle.
- Returns 200 empty body on success; 400 on invalid; 401 if no session; 429 if throttled.

## Error handling

| Path | Failure | Behavior |
|---|---|---|
| `computeStreak` | zero reviews + zero freezes | returns all-zeros struct; UI handles |
| `/today` load | DB unreachable | Next framework error boundary; logged |
| `/review` grade rate-limited | >120/min/user | redirect `/review?error=rate_limited` |
| Undo with no eligible row | none in last 30s | redirect `/review?error=cant_undo`; transient toast |
| Undo rate-limited | >30/min/user | redirect `/review?error=rate_limited` |
| `POST /api/user/timezone` | invalid IANA | 400; client ignores; user keeps `"UTC"` |
| `POST /api/user/timezone` | rate-limited | 429; client ignores |
| Daily cap exceeded | `due > cap` | session shows cap; "Review them anyway →" link exposes the rest |
| Keyboard listener | `<input>`/`<textarea>` focused | listener no-ops; `preventDefault` not called |
| Concurrent grade (double-click) | second grade arrives after first | per-user `FOR UPDATE` serializes; both ReviewLog rows persist; SM-2 applies twice in sequence; acceptable |
| Skip with `>32` skipped cards | cookie entry cap reached | older entries trimmed FIFO inside the signed cookie; user can re-enter session if all 32 distinct cards skipped (unlikely) |

## Testing

### Unit (Vitest)

- **`lib/srs.ts`** — `schedule()` with fuzz: same `(cardId, reps)` deterministic; different `reps` yields different jitter; fuzz never produces negative intervals; `intervalDays` after fuzz within `±15%` of unfuzzed.
- **`lib/srs.ts`** undo math — applying SM-2 then restoring from `prev*` yields exact original state for each of grades 0/1/2/3.
- **`lib/srs.ts`** undo of *first-ever* review of a card — `prevLastReviewedAt` is null; restored Card has `lastReviewedAt = null`, `reps = 0`, `lapses = 0`, `ease = 2.5` (default), `intervalDays = 0`.
- **Done-state copy selector** — pure function over `(hasAnyCards, hasDueSoon, nextDueAt, capOverflow)` returns the correct variant key (A/B/C/D/E) per the table in §"Done-state copy variants". Test each branch including case D (`hasCards=true, hasDueSoon=false, nextDueAt > now + 3d`).
- **`lib/streak.ts`** — daily streak: zero reviews; single review today; 7 consecutive days; one-day gap covered by freeze; one-day gap without freeze (no freezes left); 5 days then 0 freezes available; `assumeActiveDays: [today]` display path.
- **`lib/streak.ts`** — weekly: 4/7 (no badge); 5/7 (badge); two consecutive 5/7 weeks (streak=2); week boundary in user TZ on a Sunday-to-Monday flip.
- **`lib/timezone.ts`** — `dayKey`: UTC, half-hour zone (Asia/Kolkata), DST spring-forward, DST fall-back, date-line crossing (Pacific/Kiritimati). `weekKey` on Sunday→Monday boundary. `startOfMonth` in user TZ.
- **`ReviewCard.tsx`** — one React Testing Library render assertion: `fireEvent.keyDown(window, { key: '3' })` invokes the grade-3 handler (smoke insurance that the listener is wired).

### Manual e2e on Railway

After deploy:
1. Sign in fresh → `/today` shows due count + zero streak + zero weekly progress.
2. Grade 1 card → daily streak = 1, week progress = `1/5`.
3. Drain queue → done state with "Next: N due {date}" + "Review N due soon" CTA.
4. Click "Review N due soon" → 5 near-due cards reviewed; back to `/today`.
5. Set `User.dailyReviewCap = 2` in DB; have 5 due cards → session shows 2 + "Review them anyway →" link; clicking the link reviews the rest.
6. Press `Space`, `1/2/3/4`, `s`, `u` on a card — all work.
7. Grade card A, immediately grade card B, then click Undo (within 30s of card B's grade) → card B's grade reverted (most-recent ReviewLog within window).
8. Force a missed day: set system clock forward 1 day, grade → freeze auto-grants for the missed day; streak preserved.
9. Burn 2 freezes in one month, miss a 3rd day → streak resets on next grade.
10. POST garbage to `/api/user/timezone` → 400; legit "America/New_York" → 200, then DB row updated.
11. Spam the grade endpoint via curl with stolen cookies → rate limit fires after 120 calls/min.

### Integration (deferred)

Playwright e2e is valuable but NextAuth credentials testing under Next 15 beta is fiddly. Defer to a dedicated test-infra task; not on M2's critical path.

## Open items deferred to future milestones (not blocking M2)

- **CSP / HSTS headers** (Note from security review iter-1). M2 doesn't expose new XSS surfaces; tracked but punted.
- **Leech UI** — data captured in M2 (`Card.leech`); user-visible "suspend leech" action lands in M3+.
- **Per-user `dailyReviewCap` UI** — schema in place; settings page in a later milestone.
- **Server-side cron for monthly freeze reset** — not needed; freezes are computed month-bounded by query.
- **Notifications on due** — separate engagement-track milestone.
- **`ensureCards` defensive filter** — lands with M2.5 (import).

## Acceptance

- [ ] `/today` renders for a signed-in user: due count, daily streak (with freezes), weekly badge, "Start session" CTA.
- [ ] Pre-grade streak display reflects auto-freeze coverage when applicable.
- [ ] "Start session" enters `/review` and loops through due cards. Drain → redirect `/today`.
- [ ] Done state copy correct for all four `(hasCards, hasDueSoon, nextDue)` variants.
- [ ] "Review them anyway →" link in cap-overflow exposes the deferred cards.
- [ ] "Review N due soon" picker uses near-due (≤3 days), not longest-interval.
- [ ] Keyboard shortcuts: `Space`, `1`, `2`, `3`, `4`, `s` (skip), `u` (undo) work on `<ReviewCard>`. Hint row visible first 3 sessions.
- [ ] Skip excludes card from session without writing a ReviewLog; state via signed HTTP-only `m2_skip` cookie (userId-scoped, AUTH_SECRET-signed).
- [ ] Undo button visible whenever a ReviewLog within last 30s for this user exists; restores prior state, recomputes leech, removes the ReviewLog row.
- [ ] Interval fuzz ±15% applied deterministically per `(cardId, reps)`; never negative.
- [ ] Soft daily cap respected by default; overridable via `?force=1`.
- [ ] Streak math correct across DST + half-hour-zone + date-line edge cases.
- [ ] Freeze grant is race-safe under concurrent grade calls (FOR UPDATE on User row).
- [ ] `Card.leech` set to `true` when `lapses >= 8` after grade.
- [ ] `POST /api/user/timezone` is auth-gated, IANA-validated, rate-limited 1/min/user, and only updates `id = session.user.id`.
- [ ] `grade` server action is rate-limited 120/min/user; `undo` is rate-limited 30/min/user.
- [ ] All streak queries use `$queryRaw` tagged templates; no `$queryRawUnsafe`.
- [ ] Vitest suite green; `npm run build` clean; deployed to Railway; manual e2e walkthrough above succeeds.
- [ ] PRD M2 row → `complete` with link to this spec.
