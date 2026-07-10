# CLAUDE.md — working notes for Claude / agents on `anki-srs`

This file auto-loads for Claude Code. It is the portable handoff: it lives in the repo (on
GitHub), so it works on any machine. The author's local `~/.claude` memory does **not** travel —
everything you need is here, in the README, and in `docs/superpowers/`.

`anki-srs` is a spaced-repetition (SM-2) app for coding-interview problems. Next.js 15 (App
Router, RSC + server actions) · Prisma 6 · PostgreSQL · Auth.js v5 (credentials). Deployed on
Railway. See `README.md` for the base module map; this file covers **testing/CI** and the
**Card Groups** feature added on 2026-06-04.

---

## Testing & CI — read this first

**CI is the source of truth for verification.** Every push runs GitHub Actions
(`.github/workflows/test.yml`): a Postgres 16 service + `tsc --noEmit` + unit tests + DB tests.
The card-groups work was built on a machine with **no local Node/Postgres**, so the loop was:
write code → push → read CI via `gh run view --log` → iterate. If you also lack a local
toolchain, do the same. If you *do* have Node + Docker, you can run everything locally (below).

### Two vitest projects (`vitest.config.ts`)

- **`unit`** — pure-function tests, no DB. Files: `lib/**/*.test.ts` (excluding `*.db.test.ts`).
  Run: `npm run test:unit`.
- **`db`** — integration tests against real Postgres. Files: `**/*.db.test.ts`. Truncates all
  tables before each test (`test/db/setup.ts`); serial (`fileParallelism: false`). A global
  setup (`test/db/global-setup.ts`) force-resets the schema via `prisma db push`. Run:
  `npm run test:db`.

### Running DB tests locally (only if you have Node + Docker/Postgres)

```bash
npm install
npm run test:db:up      # throwaway Postgres 16 on :5433 (docker-compose.test.yml)
npm run test:db         # or: npm run test:unit
```

`.env.test` (gitignored) must point `DATABASE_URL` at a **dedicated, disposable** DB whose name
contains `anki_test` (the harness refuses to force-reset otherwise — it would wipe data). Example:
`DATABASE_URL="postgresql://test:test@localhost:5433/anki_test"`. Factories: `test/db/factory.ts`
(`makeUser`, `makeProblem`). In CI, `.env.test` is synthesized from the job env.

### Hard-won conventions (CI caught these the hard way)

- **Keep DB/business logic in `lib/`, not in `"use server"` files.** Importing an action file
  that pulls in `next-auth` / `next/headers` crashes vitest's node loader (`next/server` won't
  resolve). Pattern: pure `userId`-scoped functions in `lib/*` (DB-tested) + thin `"use server"`
  wrappers in `app/**/actions.ts` that do `auth()` → `rateLimit()` → delegate. The wrappers are
  only `tsc`-checked, never unit-tested.
- **vitest doesn't read tsconfig `paths`.** The `@/` alias is configured per-project in
  `vitest.config.ts` (a regex scoped to `@/` so it doesn't catch `@prisma/...`). Don't remove it.
- **Prisma can't `upsert`/`findUnique` on a composite-unique selector with a NULL component.**
  Curated content uses `Problem.createdById = NULL` + `@@unique([createdById, slug])`; to upsert
  it, `findFirst` then `update`/`create` (see `prisma/seed.ts`). Don't reintroduce
  `where: { createdById_slug: { createdById: null, ... } }` — it fails `tsc`.
- **This repo uses `prisma db push`, not migration files** (no `prisma/migrations/`). Schema
  changes are applied via push (dev, CI global-setup, and Railway's deploy `startCommand`).
  **Data-loss safety (2026-07-02 security audit):** the Railway `startCommand` no longer passes
  `--accept-data-loss`. Previously, because there is no migration history, a schema edit Prisma
  resolves as drop-and-recreate would **silently wipe prod data** on deploy. Now such a change
  **errors and aborts the deploy** instead — additive/safe changes still apply automatically. If
  you make a destructive schema change, the deploy will fail loudly; resolve it deliberately (and
  strongly consider adopting real migrations). The full rationale + a step-by-step plan to move to
  `prisma migrate deploy` (including baselining the existing prod DB) is in
  `docs/deployment-db-migrations.md`.

---

## Card Groups feature (2026-06-04) — COMPLETE, pending deploy verification

Lets a user create named groups (like the curated NeetCode 150), study them via a **persistent
active set**, and edit cards they own. Full design + the 4 implementation plans are in
`docs/superpowers/specs/2026-06-04-card-groups-design.md` and
`docs/superpowers/plans/2026-06-04-card-groups-*.md`. Read those before changing group behavior.

### Mental model

- **Progress (SM-2 `Card`) is always per-user and private.** Content (`Problem`) can be shared.
- **Activate** a shared group = study it (content read-only). **Duplicate** ("Make my own copy")
  = plain **deep-copy** a curated group into a PRIVATE owned group with editable problem copies,
  carrying over your SM-2 progress. (Copy-on-write was explicitly rejected.)
- **NeetCode 150** is a shared, default-active **system group** (`Group.key = "neetcode-150"`,
  `ownerId = null`, `visibility = SHARED`), so `/today` is unchanged for existing users.
- **Edit a problem iff you own it** (`problem.createdById === you`). Curated problems are read-only.

### Data model (in `prisma/schema.prisma`)

`Group { id, key?, ownerId? (null=system), visibility PRIVATE|SHARED, name, description?, sourceGroupId? }`,
`GroupProblem` (M:N group↔problem), `GroupActivation` (per-user active set),
`Problem.createdById?` + `@@unique([createdById, slug])`, `User.groupsInitialized`.

### Key modules

- `lib/active-cards.ts` — `activeCardWhere(userId, groupsInitialized)`: the single source of truth
  for "which cards are studyable today". Scopes `/today` + `/review` to active groups; falls back
  to all curated content when `groupsInitialized=false` (so un-backfilled users are unaffected).
  `hasAnyActiveCard` drives the zero-active done-state.
- `lib/groups.ts` — `ensureCards`, `selfHealActiveCards`, `createUserWithDefaultGroup` (signup),
  `SYSTEM_GROUP_KEY`.
- `lib/group-actions.ts` — **the security surface.** Ownership guards (`assertOwnedGroup`,
  `assertOwnedProblem`, `assertStudyableGroup`, `assertActiveStudyableGroup`) that throw a typed
  `GroupError`, plus create/rename/delete/activate/deactivate group, add/remove/author/edit
  problem, per-user caps, and `focusGroupCardWhere`. Pure `userId`-scoped; fully DB-tested with
  adversarial IDOR cases.
- `lib/group-duplicate.ts` — `duplicateGroup` deep-copy (curated-only, transactional, SM-2
  carryover, name disambiguation).
- `lib/group-views.ts` — read-models for the UI (`listGroupsView`, `groupDetailView`).
- `app/groups/` — UI: `actions.ts` (auth/rateLimit wrappers), `page.tsx` (sectioned list),
  `[id]/page.tsx` (detail + authoring), `[id]/study/page.tsx` (focus session), `orphans/page.tsx`,
  `GroupToggle.tsx`, `[id]/ProblemForm.tsx`.

### Authorization rules (enforce these for any new group code)

- Ownership = `group.ownerId === userId`; system groups (`ownerId = null`) never match.
- Studyable (activate) = `visibility === "SHARED" || ownerId === userId` — **never existence
  alone** (that was an IDOR). `addProblemToGroup` hard-rejects a problem unless
  `createdById === null || createdById === userId`. New authored problems get an **opaque
  `randomUUID()` slug**. `duplicateGroup` is **curated-only** (`ownerId === null && SHARED`).
- All read/queue paths derive scope from the authenticated `userId` only — never a client `groupId`
  for the daily queue.

### Status

Plans 1–4 are all **merged to `main`** and CI-green (87 DB + 63 unit tests; 3 security reviews
found no IDOR bypass). The **UI has not been click-verified in a browser** (CI can't drive one).

### What to do next (post-deploy)

1. **Click through `/groups` on the Railway deploy** (deploys on push to `main`): list sections,
   create/author/edit/remove a card, "Make my own copy" of NeetCode 150 (verify SM-2 carryover),
   "Study this group", orphaned-cards add-to-group.
2. **Run the one-time backfill** so existing users get explicit NeetCode 150 activations:
   `npm run db:backfill-groups` (or `railway run npm run db:backfill-groups`). It's idempotent.
   Until then, the `groupsInitialized=false` fallback keeps existing users working (curated pile).
3. **Capture the `EXPLAIN ANALYZE` perf plan** for the scoped queue against the seeded prod DB —
   see `docs/superpowers/notes/2026-06-04-active-card-where-explain.md` (status: pending live capture).

### Known v1 limitations / deferred (each is a future spec, not a bug)

- URL/LLM problem import — out of scope, own spec. The opaque-slug scheme leaves a dedupe seam.
- Post-duplicate "deactivate the original?" is a note in v1, not a one-click prompt.
- Focus-session ("Study this group") may route to `/review` after grading (reuses `ReviewCard`);
  per-group auto-advance is a follow-up.
- **P3 (security follow-up):** as of the 2026-07-02 audit, all *write* paths validate `Problem.url`
  against an http/https allowlist (`sanitizeProblemUrl` in `lib/group-actions.ts`, applied in
  create/edit/duplicate). Rows written **before** that fix are not retroactively scrubbed — a
  one-time backfill script (find `Problem` rows whose `url` fails `new URL()` / isn't http(s), set
  them to `null`) is the clean follow-up. Low risk in practice (authored urls were always trusted
  input from the owner), so deferred, not done here.

---

## Working style for continuing this project

- **TDD via CI:** add a `*.db.test.ts` (or unit test), implement in `lib/`, push, confirm green.
  Each `docs/superpowers/plans/*.md` is a task-by-task plan; the design spec is the contract.
- **Commit messages** are scoped/small with NO Claude attribution (no Co-Authored-By trailers —
  owner preference, 2026-07-10). Branch off `main`; merge with `--no-ff` once CI is green
  (the author reviewed + merged each plan this way).
- When in doubt about group semantics, the spec
  (`docs/superpowers/specs/2026-06-04-card-groups-design.md`) is authoritative.

## Command reference

```
npm run test:unit            # pure-function tests
npm run test:db:up           # start throwaway Postgres for db tests (needs Docker)
npm run test:db              # DB-backed integration tests
npm run db:seed              # seed curated problems + NeetCode 150 system group (idempotent)
npm run db:backfill-groups   # one-time: activate system group for existing users
npx tsc --noEmit             # typecheck (also a CI gate)
gh run list / gh run view --log   # read CI results
```
