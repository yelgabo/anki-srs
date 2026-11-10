# Follow-ups

Open work for `anki-srs`, moved out of `CLAUDE.md` on 2026-11-10 so the instruction file holds
only standing rules. Remove an item when it is done.

## P0 from the architecture review (open)

Source: [architecture review, 2026-07-10](architecture-review-2026-07-10.md), "Plan of attack".
No code commit has addressed these since the review; `lib/review.ts` does not exist and
`railway.json` has no `healthcheckPath`. Do them before feature work.

1. Fix the timezone SQL in both sites and replace the `MAX()` full scan with
   `ORDER BY reviewedAt DESC LIMIT 1` plus JS `dayKey()` (C1, M7). Add DB tests with a non-UTC
   user and an evening-local review.
2. Defuse the seed: gate the stale-delete behind an explicit env flag, log what it would delete
   otherwise, add `healthcheckPath` to `railway.json`, and move `db:seed` out of the boot path
   (C2). Take one `pg_dump` of prod before any of this lands.
3. Extract `lib/review.ts` (`gradeCardTx`, `undoLastReview`, `latestUndoableLog`, a single
   `LEECH_THRESHOLD`) and DB-test it: freeze grants including the month boundary (H3), undo,
   and the double-grade race (H2).

## Card Groups (2026-06-04): post-deploy checks

The status and to-do list below are as written in `CLAUDE.md`. None of the three items has been
confirmed done.

### Status

Plans 1-4 are all **merged to `main`** and CI-green (87 DB + 63 unit tests; 3 security reviews
found no IDOR bypass). The **UI has not been click-verified in a browser** (CI can't drive one).

### What to do next (post-deploy)

1. **Click through `/groups` on the Railway deploy** (deploys on push to `main`): list sections,
   create/author/edit/remove a card, "Make my own copy" of NeetCode 150 (verify SM-2 carryover),
   "Study this group", orphaned-cards add-to-group.
2. **Run the one-time backfill** so existing users get explicit NeetCode 150 activations:
   `npm run db:backfill-groups` (or `railway run npm run db:backfill-groups`). It's idempotent.
   Until then, the `groupsInitialized=false` fallback keeps existing users working (curated pile).
3. **Capture the `EXPLAIN ANALYZE` perf plan** for the scoped queue against the seeded prod DB -
   see `docs/superpowers/notes/2026-06-04-active-card-where-explain.md` (status: pending live capture).

## Card Groups: known v1 limitations and deferred work

### Known v1 limitations / deferred (each is a future spec, not a bug)

- URL/LLM problem import - out of scope, own spec. The opaque-slug scheme leaves a dedupe seam.
- Post-duplicate "deactivate the original?" is a note in v1, not a one-click prompt.
- Focus-session ("Study this group") may route to `/review` after grading (reuses `ReviewCard`);
  per-group auto-advance is a follow-up.
- **P3 (security follow-up):** as of the 2026-07-02 audit, all *write* paths validate `Problem.url`
  against an http/https allowlist (`sanitizeProblemUrl` in `lib/group-actions.ts`, applied in
  create/edit/duplicate). Rows written **before** that fix are not retroactively scrubbed - a
  one-time backfill script (find `Problem` rows whose `url` fails `new URL()` / isn't http(s), set
  them to `null`) is the clean follow-up. Low risk in practice (authored urls were always trusted
  input from the owner), so deferred, not done here.

## Card Groups: data model and module map

Reference text moved from `CLAUDE.md`. `prisma/schema.prisma` and the files themselves are the
source of truth.

### Data model (in `prisma/schema.prisma`)

`Group { id, key?, ownerId? (null=system), visibility PRIVATE|SHARED, name, description?, sourceGroupId? }`,
`GroupProblem` (M:N group<->problem), `GroupActivation` (per-user active set),
`Problem.createdById?` + `@@unique([createdById, slug])`, `User.groupsInitialized`.

### Key modules

- `lib/active-cards.ts` - `activeCardWhere(userId, groupsInitialized)`: the single source of truth
  for "which cards are studyable today". Scopes `/today` + `/review` to active groups; falls back
  to all curated content when `groupsInitialized=false` (so un-backfilled users are unaffected).
  `hasAnyActiveCard` drives the zero-active done-state.
- `lib/groups.ts` - `ensureCards`, `selfHealActiveCards`, `createUserWithDefaultGroup` (signup),
  `SYSTEM_GROUP_KEY`.
- `lib/group-actions.ts` - **the security surface.** Ownership guards (`assertOwnedGroup`,
  `assertOwnedProblem`, `assertStudyableGroup`, `assertActiveStudyableGroup`) that throw a typed
  `GroupError`, plus create/rename/delete/activate/deactivate group, add/remove/author/edit
  problem, per-user caps, and `focusGroupCardWhere`. Pure `userId`-scoped; fully DB-tested with
  adversarial IDOR cases.
- `lib/group-duplicate.ts` - `duplicateGroup` deep-copy (curated-only, transactional, SM-2
  carryover, name disambiguation).
- `lib/group-views.ts` - read-models for the UI (`listGroupsView`, `groupDetailView`).
- `app/groups/` - UI: `actions.ts` (auth/rateLimit wrappers), `page.tsx` (sectioned list),
  `[id]/page.tsx` (detail + authoring), `[id]/study/page.tsx` (focus session), `orphans/page.tsx`,
  `GroupToggle.tsx`, `[id]/ProblemForm.tsx`.

## History

  **Data-loss safety (2026-07-02 security audit):** the Railway `startCommand` no longer passes
  `--accept-data-loss`. Previously, because there is no migration history, a schema edit Prisma
  resolves as drop-and-recreate would **silently wipe prod data** on deploy. Now such a change
  **errors and aborts the deploy** instead - additive/safe changes still apply automatically. If
  you make a destructive schema change, the deploy will fail loudly; resolve it deliberately (and
  strongly consider adopting real migrations). The full rationale + a step-by-step plan to move to
  `prisma migrate deploy` (including baselining the existing prod DB) is in
  `docs/deployment-db-migrations.md`.
