# Anki SRS for Coding Problems

Spaced repetition (SM-2) for a curated list of LeetCode and system-design problems. MVP — see `.claude/prds/coding-problem-srs.prd.md`.

## Stack
Next.js 15 (App Router) · Postgres · Prisma 6 · Auth.js v5 (Credentials: email + bcrypt-hashed password).

## Architecture

### Module map

```
anki-srs/
├── app/                       # Next.js App Router — UI + server actions
│   ├── page.tsx               # Landing: signed-in → /today, else sign-in/up CTAs
│   ├── signup/                # Signup page + action (hash → create → signIn)
│   ├── signin/                # Signin page + action (rate-limit → signIn)
│   ├── today/                 # Queue view + inline done state; "Start session" + streak chips
│   │   ├── page.tsx
│   │   └── actions.ts         # startSessionAction (clears m2_skip cookie)
│   ├── review/                # One-card-at-a-time review loop
│   │   ├── page.tsx           # primitive: picks a card or redirects /today
│   │   ├── ReviewCard.tsx     # client: keyboard shortcuts (Space, 1/2/3/4, s), skip button
│   │   └── actions.ts         # gradeCard / skipAction / undoAction / ensureCards
│   ├── components/
│   │   ├── UndoButton.tsx     # shared; rendered on /today and /review headers
│   │   └── TimezoneCapture.tsx # client; POSTs the browser's IANA TZ once
│   ├── api/auth/[...nextauth] # Auth.js v5 route handlers
│   └── api/user/timezone/     # POST endpoint to set User.timezone
├── lib/
│   ├── auth.ts                # Auth.js config; timing-equalized credentials verify
│   ├── db.ts                  # PrismaClient singleton
│   ├── srs.ts                 # SM-2 with deterministic ±15% interval fuzz
│   ├── streak.ts              # Pure: daily + weekly streak from review/freeze day keys
│   ├── timezone.ts            # dayKey / weekKey / startOfMonth / daysBetween / addDays
│   ├── done-copy.ts           # Pure: selects /today done-state copy variant (A–E)
│   ├── signed-cookie.ts       # HMAC-SHA256-signed cookies (m2_skip uses this)
│   ├── skip-cookie.ts         # Server reader for the m2_skip cookie
│   ├── password.ts            # bcrypt hash/verify + KNOWN_BAD_HASH + validateStrength
│   ├── rate-limit.ts          # LRU-bounded in-process token bucket (single-replica only)
│   ├── get-client-ip.ts       # Safe XFF parsing (rejects spoofed headers)
│   └── seed-data.ts           # Curated starter problems
├── prisma/
│   ├── schema.prisma          # User · Card · ReviewLog · StreakFreeze · Problem + Auth.js
│   └── seed.ts                # Upsert problems on every boot (idempotent)
├── railway.json               # Railpack config — `db push && seed && next start` on boot
└── types/next-auth.d.ts       # Session.user.id type augmentation
```

### Data model

```
User ──┬─< Card >── Problem
       ├─< ReviewLog
       ├─< StreakFreeze       (one row per user-day a freeze covered; max 2/month)
       ├─< Account   ┐
       └─< Session   │  Auth.js v5 adapter tables (unused by Credentials,
                     │  kept for future OAuth providers without a migration)
VerificationToken ───┘
```

- **User** — adds `timezone` (IANA, default `"UTC"`) and `dailyReviewCap` (default 50). Timezone is set on first authenticated load via `TimezoneCapture`.
- **Problem** — global, seeded from `lib/seed-data.ts`. `prompt` (card front), `approach` (card back), `tags`.
- **Card** — per-user, per-problem SRS state: `ease`, `intervalDays`, `reps`, `lapses`, `dueAt`, `lastReviewedAt`, `leech` (true when `lapses ≥ 8`).
- **ReviewLog** — append-only history with full `prev*` snapshot (`prevInterval`, `prevEase`, `prevReps`, `prevLapses`, `prevLastReviewedAt`) so undo restores exactly the prior Card state.
- **StreakFreeze** — `(userId, usedOn)` unique. Granted automatically in the grade transaction when there's a coverable gap; 2-per-calendar-month cap enforced by `SELECT FOR UPDATE` on the User row.

### Request flows

**Signup (`POST /signup`, server action `signupAction`)**
1. Zod-validate `{ email, password, confirm }`; check `password === confirm`.
2. `validateStrength` — reject weak passwords with a specific reason (signup is not enumeration).
3. Rate-limit by IP (10/hour) **and** email (3/hour).
4. **Hash password before any DB call** — equalizes timing between "email available" and "email taken" paths.
5. `prisma.user.create`. On unique-violation → generic `signup_failed` redirect (no enumeration).
6. Call `signIn("credentials", ...)` → redirects to `/review`.

**Signin (`POST /signin`, server action `signinAction`)**
1. Zod-validate `{ email, password }`.
2. Rate-limit by IP (20/5min) **and** email (5/5min). Per-email is the credential-stuffing defense.
3. Call `signIn("credentials", ...)`. Auth.js invokes `authorize()` in `lib/auth.ts`:
   - Look up user. Always run `bcrypt.compare(password, user?.passwordHash ?? KNOWN_BAD_HASH)` — timing identical whether email exists or not.
   - Log a `signin_attempt` JSON line (never the password).
   - Return user on success, `null` on any failure.
4. Success → 302 to `/review` with JWT session cookie (7-day TTL).
5. Failure → 302 back to `/signin?error=invalid_credentials`. No way to tell "wrong email" from "wrong password" from the response.

**Today (`GET /today`)**
1. `auth()` → redirect `/signin` if no session.
2. `ensureCards(userId)` provisions any missing Card rows.
3. Load due count (capped at `User.dailyReviewCap`), due-soon count (`(now, now+3d]`), next-due date, and full Card/ReviewLog/StreakFreeze day arrays.
4. `computeStreak` runs twice — actual + projected (with `assumeActiveDays: [today]`) — to surface "+1 if you review today" honestly.
5. Render: streak chips · weekly badge · `<UndoButton>` · **either** "Start session →" with due-count and cap-overflow link **or** done-state copy (one of 5 variants A–E from `lib/done-copy.ts`) with optional "Review N due soon →" CTA.

**Review session (`GET /review`)**
1. Auth check. Parse `?ahead=N` (due-soon mode) and `?force=1` (ignore cap).
2. Read `m2_skip` cookie via `lib/skip-cookie.ts` — list of card IDs skipped this session.
3. Pick one card with `orderBy: [{ dueAt: 'asc' }, { id: 'asc' }]` and `id: { notIn: skipped }`. No card → `redirect("/today")`.
4. Render `<ReviewCard>` with reveal-then-grade flow + `<UndoButton>` in header.
5. **Keyboard:** Space (reveal), 1/2/3/4 (grade), s (skip). `preventDefault` only on handled keys; no-op when an input/textarea is focused.

**Grade (`gradeCard` server action — replaces M1's body)**
1. Auth check; rate-limit 120/min/user.
2. Verify card ownership; compute SM-2 update via `schedule(state, grade, { cardId, now })` (with fuzz).
3. Open `$transaction(async tx => …)`. Acquire `SELECT id FROM "User" WHERE id = $userId FOR UPDATE` to serialize freeze grants.
4. Find the user's most recent active day (max of ReviewLog dates and StreakFreeze.usedOn, in user TZ). If a gap exists, `upsert` up to `2 - freezesUsedThisMonth` StreakFreeze rows.
5. Update Card with new SM-2 fields + `leech = lapses >= 8`. Append ReviewLog with **all** `prev*` snapshots.
6. `revalidatePath("/review")` and `/today`.

**Skip (`skipAction`)** — appends `cardId` to the `m2_skip` cookie (signed `{userId, ids, iat}`, max 32 entries, FIFO trim). No DB writes.

**Undo (`undoAction`)** — rate-limit 30/min/user; inside `$transaction` with FOR UPDATE, find most-recent `ReviewLog` for this user with `reviewedAt > now - 30s`, restore Card from `prev*` (handles first-review `prevLastReviewedAt = null`), recompute `leech`, delete the ReviewLog row.

### Deployment topology (Railway)

```
compassionate-charisma  (Railway project — Trial plan)
└── production
    ├── kimbo       (Python, unrelated — pre-existing)
    ├── Postgres    (single source of truth; Card / User / ReviewLog / Problem)
    │   ⇡ DATABASE_URL via ${{Postgres.DATABASE_URL}} (private network)
    └── anki-srs    (Next.js, 1 replica — required by in-process rate limiter)
                    Required env vars: DATABASE_URL, AUTH_SECRET,
                    AUTH_TRUST_HOST=true, AUTH_URL=<public domain>
                    Postgres-only: `SELECT FOR UPDATE` used by grade/undo actions
                    silently no-ops on SQLite, so do not switch backends in dev.
```

The single-replica constraint comes from `lib/rate-limit.ts` — the token bucket lives on `globalThis` and doesn't span containers. Adding a second replica silently weakens the rate limit. Swap to Redis (Upstash) when traffic justifies it.

## Local dev

```bash
cp .env.example .env          # fill in DATABASE_URL + AUTH_SECRET
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Test

```bash
npm test                      # vitest: 63 tests across srs, streak, timezone,
                              # signed-cookie, done-copy, password, rate-limit
```

## Deploy (Railway)

See `railway.json` for the start command — it runs `prisma db push` + `db:seed` on every boot. Both are idempotent.

```bash
railway up --service anki-srs --ci
```

## Auth

- Sign up at `/signup` with email + password (≥10 chars, must contain one non-letter).
- **No password reset in this MVP.** Save your password somewhere safe.
- Per-IP and per-email rate limits on `/signin` (5 attempts per 5 min) and `/signup` (10 per IP / 3 per email per hour).
- Bcrypt cost factor 12. JWT sessions, 7-day lifetime.
- Forensic trail: `signin_attempt` JSON line written to stdout — never includes the password.

## Review session features (M2)

- **Daily streak** with up to 2 auto-freezes per calendar month — auto-spent on missed days, never user-visible inventory.
- **Weekly badge** — earns when ≥5 review days fall in a Mon–Sun week.
- **Interval fuzz** — SM-2 result is jittered ±15% deterministically by `(cardId, reps)`; cards that would all pile on one day spread across a few.
- **Soft daily cap** (`User.dailyReviewCap`, default 50) with explicit "Review them anyway →" override via `?force=1`.
- **"Review N due soon"** when caught up — picks near-due cards (`dueAt ∈ (now, now+3d]`) rather than long-interval cards, to minimize schedule distortion.
- **Skip** — keyboard `s` or button; tracked in a signed HTTP-only cookie (`m2_skip`, AUTH_SECRET-signed, userId-scoped, 32-card FIFO).
- **Undo** — visible in the page header for 30 seconds after a grade; restores full Card state from ReviewLog's `prev*` columns and deletes the log row.
- **Keyboard shortcuts** — Space (reveal), 1/2/3/4 (grade), s (skip), all scoped so they don't break browser/system keys.
- **Leech detection** — `Card.leech = true` when `lapses ≥ 8`; data captured now, UI deferred to a later milestone.

## Notes
- SM-2 lives in `lib/srs.ts` — pure function with deterministic fuzz; easy to swap algorithms.
- Curated problems live in `lib/seed-data.ts` — restated in our own words to sidestep LeetCode licensing.
- In-process rate limiter (`lib/rate-limit.ts`) assumes single replica. Keep `numReplicas=1` on Railway.
- All streak queries use `prisma.$queryRaw` tagged templates (parameterized `AT TIME ZONE`), never `$queryRawUnsafe`.
