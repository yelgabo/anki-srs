# Anki SRS for Coding Problems

Spaced repetition (SM-2) for a curated list of LeetCode and system-design problems. MVP — see `.claude/prds/coding-problem-srs.prd.md`.

## Stack
Next.js 15 (App Router) · Postgres · Prisma 6 · Auth.js v5 (Credentials, email-only — MVP).

## Local dev

```bash
cp .env.example .env          # fill in DATABASE_URL + AUTH_SECRET
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Deploy (Railway)

```bash
railway login
railway init
railway add --plugin postgresql
railway variables --set AUTH_SECRET=$(openssl rand -base64 32) --set AUTH_TRUST_HOST=true
railway up
```

Migrations and seed run automatically on every boot (see `nixpacks.toml`).

## Notes
- **Auth is intentionally weak** (email-only, no password). Tighten before adding real users.
- SM-2 lives in `lib/srs.ts` — pure function, easy to swap.
- Curated problems live in `lib/seed-data.ts` — restated in our own words to sidestep LeetCode licensing.
