# Anki SRS for Coding Problems

Spaced repetition (SM-2) for a curated list of LeetCode and system-design problems. MVP — see `.claude/prds/coding-problem-srs.prd.md`.

## Stack
Next.js 15 (App Router) · Postgres · Prisma 6 · Auth.js v5 (Credentials: email + bcrypt-hashed password).

## Architecture

### Module map

```
anki-srs/
├── app/                       # Next.js App Router — UI + server actions
│   ├── page.tsx               # Landing: signed-in → /review, else /signin
│   ├── signup/                # Signup page + server action (hash → create → signIn)
│   ├── signin/                # Signin page + server action (rate-limit → signIn)
│   ├── review/                # Review loop: pulls due card, grade buttons → server action
│   └── api/auth/[...nextauth] # Auth.js v5 route handlers (CSRF, callback, session)
├── lib/
│   ├── auth.ts                # Auth.js config; Credentials authorize w/ timing-equalized verify
│   ├── db.ts                  # PrismaClient singleton
│   ├── srs.ts                 # SM-2 algorithm (pure function, no I/O)
│   ├── password.ts            # bcrypt hash/verify + KNOWN_BAD_HASH + validateStrength
│   ├── rate-limit.ts          # LRU-bounded in-process token bucket (single-replica only)
│   ├── get-client-ip.ts       # Safe XFF parsing (rejects spoofed headers)
│   └── seed-data.ts           # Curated starter problems
├── prisma/
│   ├── schema.prisma          # User · Card · ReviewLog · Problem + Auth.js adapter tables
│   └── seed.ts                # Upsert problems on every boot (idempotent)
├── railway.json               # Railpack config — `db push && seed && next start` on boot
└── types/next-auth.d.ts       # Session.user.id type augmentation
```

### Data model

```
User ──┬─< Card >── Problem
       ├─< ReviewLog
       ├─< Account   ┐
       └─< Session   │  Auth.js v5 adapter tables (unused by Credentials,
                     │  kept for future OAuth providers without a migration)
VerificationToken ───┘
```

- **Problem** — global, seeded from `lib/seed-data.ts`. `prompt` (card front), `approach` (card back), `tags`.
- **Card** — per-user, per-problem SRS state: `ease`, `intervalDays`, `reps`, `lapses`, `dueAt`. Cards are lazy-provisioned on the first `/review` visit (one card per problem per user).
- **ReviewLog** — append-only history. Each grade writes one row; powers future retention analytics (M3).

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

**Review (`GET /review`)**
1. `auth()` — JWT-backed session lookup. No session → redirect `/signin`.
2. `ensureCards(userId)` — lazy-provision any missing Card rows.
3. Pick a card: prefer `dueAt <= now` (oldest first); fall back to any unreviewed card for first-timers.
4. Render `<ReviewCard>` client component: front, "Show approach" reveal, four grade buttons.
5. Grade click → `gradeCard(formData)` server action:
   - Auth check; ownership check (card.userId === session.user.id).
   - `schedule()` from `lib/srs.ts` — pure SM-2.
   - One transaction: update Card, append ReviewLog.
   - `revalidatePath("/review")` → renders the next card.

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
npm test                      # vitest: lib/password + lib/rate-limit
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

## Notes
- SM-2 lives in `lib/srs.ts` — pure function, easy to swap.
- Curated problems live in `lib/seed-data.ts` — restated in our own words to sidestep LeetCode licensing.
- In-process rate limiter (`lib/rate-limit.ts`) assumes single replica. Keep `numReplicas=1` on Railway.
