# Performance gate: `activeCardWhere` queue scoping (spec Step 2 / plan T2.4)

**Date:** 2026-06-04 · **Branch:** `feat/card-groups`

## What this gates

The hottest path in the app is the `/today` due count and the `/review` queue,
now scoped through `activeCardWhere(userId, true)` — a correlated `EXISTS` over
`GroupActivation → Group → GroupProblem → Problem`. The risk: a full sequential
scan of `Card` with a per-row correlated subquery (O(cards) × subquery), which
degrades as a user accumulates cards.

## Supporting indexes (present in `schema.prisma`)

- `Card @@index([userId, dueAt])` — drives the outer scan: find this user's due
  cards first (a small set), not all cards.
- `GroupProblem @@index([problemId])` — the per-problem membership direction of
  the EXISTS.
- `GroupActivation @@id([userId, groupId])` (userId-leading) + `@@index([userId])`
  — the activation join.
- `Group @@index([ownerId])`, `@@index([visibility])` — the `OR [{visibility:SHARED},{ownerId:userId}]` guard.

## Expected plan shape (production-sized data)

For the `/today` due count:

```sql
EXPLAIN ANALYZE
SELECT count(*) FROM "Card" c
WHERE c."userId" = '<USER_ID>'
  AND c."dueAt" <= now()
  AND EXISTS (
    SELECT 1 FROM "GroupProblem" gp
    JOIN "Group" g  ON g.id = gp."groupId"
    JOIN "GroupActivation" ga ON ga."groupId" = g.id AND ga."userId" = c."userId"
    WHERE gp."problemId" = c."problemId"
      AND (g.visibility = 'SHARED' OR g."ownerId" = c."userId")
  );
```

**Acceptance:** the planner drives on `Card_userId_dueAt_idx` (Index/Bitmap scan on
`Card`, **no full Seq Scan on `Card`**), with the membership check as a correlated
semi-join. Target p95 < ~15ms for a default 150-card user.

**Fallback if it regresses at scale:** materialize the active problem-id set per
request and pass `problemId: { in: [...] }`, or denormalize a per-user membership
table. Neither is needed at current scale.

## Why this is NOT asserted in CI

CI's Postgres service holds only a handful of test rows. Postgres correctly chooses
a **sequential scan for tiny tables** (it's faster than an index scan there), so an
automated "no Seq Scan on Card" assertion in CI would fail on *correct* behavior — a
false signal. The query's correctness and the indexes are covered by the db tests
(`lib/active-cards.db.test.ts`, `app/review/queue.db.test.ts`); the plan shape must
be validated against production-sized data.

## How to capture the live plan (post-deploy)

Run the `EXPLAIN ANALYZE` above against the **seeded Railway DB** with a real
default user (150 cards), e.g. via the Railway connection:

```bash
railway run -- psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT count(*) FROM \"Card\" c WHERE ..."
```

Paste the resulting plan + timing below once captured. **Status: pending live capture.**

```
(plan output to be pasted after deploy)
```
