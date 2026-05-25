# Anki SRS for Coding Problems

Spaced repetition (SM-2) for a curated list of LeetCode and system-design problems. MVP — see `.claude/prds/coding-problem-srs.prd.md`.

## Stack
Next.js 15 (App Router) · Postgres · Prisma 6 · Auth.js v5 (Credentials: email + bcrypt-hashed password).

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
