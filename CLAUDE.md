# anki-srs

A spaced-repetition (SM-2) app for coding-interview problems: Next.js 15 (App Router, server
actions), Prisma 6, PostgreSQL, Auth.js v5 (credentials), deployed on Railway. `README.md` has
the module map.

Before a significant change, read `docs/architecture-review-2026-07-10.md`. Its three P0 items
are live correctness bugs and are still open; they are listed in `docs/follow-ups.md` with the
other open work. Keep `docs/architecture.drawio` and its `.drawio.png` current.

## Testing

CI (`.github/workflows/test.yml`) runs on every push: Postgres 16, `tsc --noEmit`, unit tests
and DB tests. It is the gate, and a push to `main` also deploys on Railway. Run the tests
locally before pushing.

```
npm run test:unit      # pure-function tests, lib/**/*.test.ts
npm run test:db:up     # throwaway Postgres 16 on :5433 (needs Docker)
npm run test:db        # integration tests, **/*.db.test.ts, serial, truncates before each test
npx tsc --noEmit
```

`.env.test` (gitignored) must point `DATABASE_URL` at a disposable database whose name contains
`anki_test`, for example `postgresql://test:test@localhost:5433/anki_test`. The harness refuses
to force-reset any other database because the reset wipes it. Factories are in
`test/db/factory.ts`.

## Conventions

- Keep database and business logic in `lib/`, not in `"use server"` files. Importing an action
  file pulls in `next-auth` and `next/headers`, which crashes vitest's node loader. Write pure
  `userId`-scoped functions in `lib/*` with DB tests, and thin wrappers in `app/**/actions.ts`
  that call `auth()`, then `rateLimit()`, then delegate. The wrappers are only type-checked.
- vitest does not read tsconfig `paths`. The `@/` alias is set per project in
  `vitest.config.ts`, with a regex scoped to `@/` so it does not catch `@prisma/...`. Keep it.
- Prisma cannot `upsert` or `findUnique` on a composite-unique selector with a NULL component.
  Curated content uses `Problem.createdById = NULL` with `@@unique([createdById, slug])`, so
  use `findFirst` then `update` or `create` (see `prisma/seed.ts`). A
  `where: { createdById_slug: { createdById: null } }` selector fails `tsc`.
- Schema changes apply through `prisma db push`; there are no migration files. The Railway
  `startCommand` runs it without `--accept-data-loss`, so a destructive schema change fails the
  deploy instead of wiping production data. The plan to adopt real migrations is
  `docs/deployment-db-migrations.md`.
- Branch off `main` and merge with `--no-ff` once CI is green.

## Card Groups

The design spec `docs/superpowers/specs/2026-06-04-card-groups-design.md` is authoritative;
read it before changing group behavior.

- SM-2 progress (`Card`) is per user and private. Content (`Problem`) can be shared.
- Activating a shared group studies it read-only. "Make my own copy" deep-copies a curated
  group into a private owned group and carries over SM-2 progress.
- NeetCode 150 is a shared system group (`Group.key = "neetcode-150"`, `ownerId = null`).
- `activeCardWhere(userId, groupsInitialized)` in `lib/active-cards.ts` is the single source of
  truth for which cards are studyable today. It falls back to all curated content when
  `groupsInitialized` is false, so users who have not been backfilled are unaffected.
- `lib/group-actions.ts` is the security surface: the ownership guards (`assertOwnedGroup`,
  `assertOwnedProblem`, `assertStudyableGroup`, `assertActiveStudyableGroup`) throw a typed
  `GroupError`, and its DB tests include adversarial IDOR cases.

Authorization rules for any new group code:

- Ownership means `group.ownerId === userId`. System groups (`ownerId = null`) never match.
- A group is studyable when `visibility === "SHARED" || ownerId === userId`. Existence alone is
  not enough; treating it as enough was an IDOR.
- `addProblemToGroup` rejects a problem unless `createdById === null || createdById === userId`.
- A user may edit a problem only when `problem.createdById` is that user.
- New authored problems get an opaque `randomUUID()` slug.
- `duplicateGroup` accepts curated groups only (`ownerId === null` and `SHARED`).
- Read and queue paths derive scope from the authenticated `userId`, never from a client
  `groupId` for the daily queue.
