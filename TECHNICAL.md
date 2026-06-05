# Technical reference — anki-srs

Deep-dive on architecture, data model, request flows, authorization, testing, and deployment.
For the project overview and quick start, see [`README.md`](./README.md). For contributor
conventions and the hard-won CI gotchas, see [`CLAUDE.md`](./CLAUDE.md).

## Architecture

### Module map

```
anki-srs/
├── app/                       # Next.js App Router — UI + thin "use server" action wrappers
│   ├── page.tsx               # Landing: signed-in → /today, else sign-in/up CTAs
│   ├── signup/ · signin/      # Auth pages + actions (hash → create → signIn / rate-limit → signIn)
│   ├── today/                 # Queue view + done state; "Start session" + streak chips
│   ├── review/                # One-card-at-a-time review loop
│   │   ├── ReviewCard.tsx     # client: keyboard shortcuts (Space, 1/2/3/4, s), skip button
│   │   └── actions.ts         # gradeCard / skipAction / undoAction / ensureCards wrappers
│   ├── groups/                # Card Groups UI: list, detail + authoring, focus study, orphans
│   ├── components/            # UndoButton, TimezoneCapture (shared client bits)
│   └── api/                   # Auth.js v5 route handlers + POST /api/user/timezone
├── lib/                       # Pure, userId-scoped business logic (the tested core)
│   ├── auth.ts                # Auth.js config; timing-equalized credentials verify
│   ├── srs.ts                 # SM-2 with deterministic ±15% interval fuzz
│   ├── active-cards.ts        # activeCardWhere(): single source of truth for "studyable today"
│   ├── groups.ts              # ensureCards, selfHealActiveCards, signup default group
│   ├── group-actions.ts       # security surface: ownership guards + create/edit/activate/…
│   ├── group-duplicate.ts     # deep-copy a curated group into a private owned one (SM-2 carryover)
│   ├── group-views.ts         # read-models for the groups UI
│   ├── streak.ts              # pure daily + weekly streak from review/freeze day keys
│   ├── timezone.ts            # dayKey / weekKey / startOfMonth / daysBetween / addDays
│   ├── done-copy.ts           # pure: picks /today done-state copy variant (A–E)
│   ├── signed-cookie.ts       # HMAC-SHA256-signed cookies (the m2_skip skip list)
│   ├── password.ts            # bcrypt hash/verify + KNOWN_BAD_HASH + validateStrength
│   ├── rate-limit.ts          # LRU-bounded in-process token bucket (single-replica only)
│   ├── get-client-ip.ts       # safe XFF parsing (rejects spoofed headers)
│   └── seed-data.ts           # curated starter problems (restated in our own words)
└── prisma/
    ├── schema.prisma          # User · Card · ReviewLog · StreakFreeze · Problem · Group* + Auth.js
    ├── seed.ts                # idempotent upsert of curated problems + NeetCode 150 system group
    └── backfill-groups.ts     # one-time activation backfill for pre-groups users
```

**Layering convention:** all DB/business logic lives in `lib/` as pure `userId`-scoped functions
that are directly DB-tested. The `app/**/actions.ts` files are thin `"use server"` wrappers that do
`auth()` → `rateLimit()` → delegate to `lib/`. Keeping `next-auth`/`next/headers` out of `lib/`
is what lets the core be tested under Vitest's node loader.

## Data model

```
User ──┬─< Card >── Problem
       ├─< ReviewLog
       ├─< StreakFreeze       (one row per user-day a freeze covered; max 2/month)
       ├─< GroupActivation    (per-user active set — which groups feed today's queue)
       ├─< Group              (owned, private groups; system groups have ownerId = null)
       ├─< Account / Session  (Auth.js adapter tables; unused by Credentials, kept for OAuth)
       └─ …
Group ──< GroupProblem >── Problem
```

- **Problem** — content (`prompt` = card front, `approach` = card back, `tags`). Curated problems
  have `createdById = null`; user-authored problems get an opaque `randomUUID()` slug.
  `@@unique([createdById, slug])`.
- **Card** — per-user, per-problem SRS state: `ease`, `intervalDays`, `reps`, `lapses`, `dueAt`,
  `lastReviewedAt`, `leech` (true when `lapses ≥ 8`). **Progress is always private**, even for
  shared content.
- **ReviewLog** — append-only history with a full `prev*` snapshot, so undo restores the exact
  prior Card state.
- **StreakFreeze** — `(userId, usedOn)` unique. Granted automatically inside the grade transaction
  when there's a coverable gap; 2-per-calendar-month cap enforced via `SELECT FOR UPDATE` on User.
- **Group / GroupProblem / GroupActivation** — named collections of problems. A group is shared or
  private; activating one adds its cards to your daily queue. NeetCode 150 ships as a default-active
  **system group** (`key = "neetcode-150"`, `ownerId = null`, `visibility = SHARED`).

## Request flows

**Signup** — Zod-validate `{email, password, confirm}` → `validateStrength` → rate-limit by IP
(10/hr) **and** email (3/hr) → **hash before any DB call** (equalizes timing of taken vs. available
email) → `user.create` (unique-violation → generic `signup_failed`, no enumeration) → `signIn`.

**Signin** — Zod-validate → rate-limit by IP (20/5min) and email (5/5min; the credential-stuffing
defense) → `signIn`. `authorize()` always runs `bcrypt.compare` against `passwordHash ?? KNOWN_BAD_HASH`
so timing is identical whether the email exists or not. The response can't distinguish wrong-email
from wrong-password.

**Today (`GET /today`)** — `auth()` → `ensureCards(userId)` → load due count (capped at
`dailyReviewCap`), due-soon count, next-due date, and the day arrays for streaks. `computeStreak`
runs twice (actual + projected) to honestly surface "+1 if you review today". Renders streak chips,
weekly badge, undo, and either "Start session →" or one of five done-state copy variants.

**Review (`GET /review`)** — pick one card with `orderBy: [{dueAt:'asc'},{id:'asc'}]` excluding the
signed `m2_skip` skip-list; no card → redirect `/today`. `<ReviewCard>` drives a reveal-then-grade
flow. Keyboard: Space (reveal), 1/2/3/4 (grade), s (skip) — scoped so they never hijack browser keys
or fire while typing in a field.

**Grade (`gradeCard`)** — auth + rate-limit (120/min) → verify card ownership → compute SM-2 via
`schedule(state, grade, …)` → in a `$transaction` with `SELECT … FOR UPDATE` on the User row, grant
up to `2 − usedThisMonth` freezes for any gap, update the Card, and append a ReviewLog with every
`prev*` snapshot → revalidate.

**Undo (`undoAction`)** — within 30s of a grade, find the latest ReviewLog for the user, restore the
Card from its `prev*` columns, recompute `leech`, and delete the log row — all under FOR UPDATE.

## Card Groups & authorization

Groups let a user study named subsets and own/edit their own content, without ever exposing another
user's progress. The rules enforced across `lib/group-actions.ts` (and DB-tested with adversarial
IDOR cases):

- **Ownership** = `group.ownerId === userId`; system groups (`ownerId = null`) never match.
- **Studyable** = `visibility === "SHARED" || ownerId === userId` — never existence alone.
- **Editable problem** iff `problem.createdById === userId`; curated content is read-only.
- **"Make my own copy"** deep-copies a curated group into a private owned group with editable
  problem copies, carrying SM-2 progress over (copy-on-write was deliberately rejected).
- Every daily-queue/read path derives scope from the authenticated `userId` only — never from a
  client-supplied `groupId`.

`lib/active-cards.ts` (`activeCardWhere`) is the single source of truth for which cards are
studyable today; pre-groups users transparently fall back to the full curated pile.

## Testing

Two Vitest projects (`vitest.config.ts`):

```bash
npm run test:unit             # pure-function tests, no DB (lib/**/*.test.ts)
npm run test:db:up            # throwaway Postgres 16 on :5433 (needs Docker)
npm run test:db               # integration tests against real Postgres (**/*.db.test.ts)
npx tsc --noEmit              # typecheck (also a CI gate)
```

`db` tests truncate all tables before each test and run serially against a **dedicated, disposable**
database whose name contains `anki_test` (the harness refuses to reset otherwise). CI
(`.github/workflows/test.yml`) spins up a Postgres 16 service and runs `tsc` + unit + DB tests on
every push — it's the source of truth for verification. Current suite: 63 unit + 87 DB tests.

## Deployment

Designed for a single Postgres + a single Next.js replica. `railway.json` runs `prisma db push` +
`db:seed` on every boot (both idempotent). Required env: `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_TRUST_HOST=true`, `AUTH_URL=<public domain>`.

> **Single-replica constraint:** `lib/rate-limit.ts` is an in-process token bucket on `globalThis`
> — it does not span containers. A second replica silently weakens every rate limit. Move to a
> shared store (e.g. Upstash Redis) before scaling out.

## Implementation notes

- **SM-2** lives in `lib/srs.ts` as a pure function with deterministic ±15% fuzz keyed by
  `(cardId, reps)`, so cards that would pile on one day spread out — and the algorithm is trivial to
  swap.
- **Streaks** support up to 2 auto-freezes per calendar month, spent automatically on missed days;
  there is no user-visible freeze inventory. The weekly badge needs ≥5 review days in a Mon–Sun week.
- **Skip** is a signed, HTTP-only, userId-scoped cookie (`m2_skip`, 32-card FIFO) — no DB writes.
- **Leech detection** flags `Card.leech` at `lapses ≥ 8`; the data is captured, UI is deferred.
- **No password reset** in the current build — Credentials only. Bcrypt cost 12, JWT sessions
  (7-day TTL). A `signin_attempt` JSON line is logged to stdout and never includes the password.
- All streak queries use parameterized `prisma.$queryRaw` tagged templates (`AT TIME ZONE`), never
  `$queryRawUnsafe`.
