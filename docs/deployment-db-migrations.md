# Deployment DB strategy & migrating off `db push` (data-loss safety)

## What changed (2026-07-02, security audit)

The Railway deploy `startCommand` in `railway.json` used to run:

```
npx prisma db push --accept-data-loss --skip-generate && ...
```

`--accept-data-loss` tells Prisma to **execute destructive changes without
prompting**. Because this repo has **no `prisma/migrations/` directory**, Prisma
diffs `schema.prisma` against the live DB on every boot. Some schema edits (e.g.
renaming a field, changing a relation, altering a column type) are resolved by
Prisma as **drop-and-recreate**. With `--accept-data-loss` that silently
**destroys production data** on the next deploy.

**Fix applied (primary):** removed `--accept-data-loss`. The deploy still uses
`db push` (unchanged workflow otherwise), but any change Prisma classifies as
destructive now **errors and aborts the deploy** instead of executing. That
turns a silent data-loss event into a loud, safe failure you must consciously
resolve. Additive/safe changes (new nullable column, new table, new index) still
apply automatically.

`--skip-generate` is retained (the client is generated at build time).

## Recommended next step: adopt real migrations

`db push` is a dev/prototyping tool; production should run a reviewed, ordered
migration history via `prisma migrate deploy`. This was **not** done as part of
the audit fix because it can't be generated or verified safely without the
Prisma CLI + DB access (Node is not installed on the author's machine), and
because baselining an **already-deployed** production DB is a manual, one-time
step that must be run against prod. Steps to adopt later, in order:

1. On a machine with Node + the Prisma CLI, from a clean checkout:
   ```bash
   npm install
   # Generate the baseline migration WITHOUT applying it (captures current schema):
   mkdir -p prisma/migrations/0000_baseline
   npx prisma migrate diff \
     --from-empty \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/0000_baseline/migration.sql
   ```
   Review `migration.sql` — it should CREATE every table/enum/index currently in
   `schema.prisma` and nothing destructive.

2. **Baseline the existing production DB** (it already has these tables from the
   `db push` history, so the baseline must be marked as *already applied* rather
   than re-run — otherwise `migrate deploy` fails on "relation already exists"):
   ```bash
   # Against prod DATABASE_URL, one time only:
   npx prisma migrate resolve --applied 0000_baseline
   ```
   For a brand-new/empty environment (fresh DB) you skip this — `migrate deploy`
   applies the baseline normally.

3. Switch the Railway `startCommand` in `railway.json` to:
   ```
   npx prisma migrate deploy && npx tsx prisma/seed.ts && npx next start -p ${PORT:-3000}
   ```

4. Update the CI global-setup (`test/db/global-setup.ts`) and local test loop —
   they currently force-reset via `db push`. Either keep `db push` for the
   disposable test DB (fine — it's throwaway) or switch to
   `prisma migrate reset --force`. Keeping `db push` for tests is simplest.

5. Thereafter, each schema change is authored as a new migration
   (`prisma migrate dev --name <change>`), reviewed in the PR, and applied by
   `migrate deploy` on deploy. Destructive steps are then explicit and reviewed.

Until step 2 is done against prod, **do not** switch the start command to
`migrate deploy` — it would fail on the existing DB.
