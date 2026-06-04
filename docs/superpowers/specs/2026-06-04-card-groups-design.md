# Design: Card Groups

**Date:** 2026-06-04
**Status:** Approved (post panel review; deep-copy Duplicate variant)

Let the user create named groups (like NeetCode 150), fill them with hand-picked cards,
study them as part of a persistent active mix, and edit the cards they own.

This spec was hardened by a four-expert review panel (product designer, security,
architect, tech lead) over two iterations. The one deliberate deviation from the panel's
v3: **Duplicate is a plain deep-copy, not copy-on-write/fork-on-edit** (user decision —
simpler, fully-owned copies, no template-drift machinery).

## Decided product shape (locked)

- **Progress (SM-2 state) is always per-user and private.** Content (prompt/approach text)
  is what can be shared.
- **Two verbs:**
  - **Activate** a shared group to study it (content read-only, progress yours).
  - **Duplicate ("Make my own copy")** a curated shared group → deep-copies its cards into
    your ownership so you can edit them. The copy is fully independent from the moment it's made.
- You can **create an empty group** and **author cards** by hand, or **add cards you already own**.
- Study via a **persistent active set** (toggle groups active/inactive; `today` shows the
  merged due pile across active groups), with an optional **single-group focus session**.
- **Many-to-many:** a card can live in multiple groups, one shared SM-2 state per `(user, problem)`.
- **NeetCode 150** is a shared, **default-active** system group, so today's behavior is unchanged.
- **Edit** a problem's content iff you own it (`problem.createdById === you`). Curated/shared
  problems are read-only.
- **URL/LLM import is DEFERRED** to its own later spec.

---

## 1. Data model

All schema changes are additive (no destructive column changes).

### 1.1 Problem gains ownership + a safe slug scheme

- `createdById String?` — `null` = curated/system content; set = user-authored.
- `createdBy User?` relation with **`onDelete: SetNull`** (NOT Cascade). A user delete must not
  cascade across shared `Problem` rows into other users' groups/cards. A deleted user's authored
  problems become curated-namespace orphans; their own `Card`s still cascade via `Card.user`.
- **Slug scheme:** change `slug @unique` (global) to `@@unique([createdById, slug])`.
  - Curated content stays in the `createdById = NULL` namespace.
  - User-authored problems and duplicated copies get an **opaque random slug** (`cuid()`),
    never derived from title or userId. Closes enumeration/IDOR-by-guessed-slug, intra-user
    collisions, and userId leakage.
  - **Postgres NULL-distinctness note:** the composite does NOT enforce uniqueness among curated
    rows (NULLs compare distinct). Curated-slug uniqueness rests on seed-list discipline,
    optionally hardened by a partial unique index `WHERE createdById IS NULL`.
  - No route resolves a `Problem` by a user-controlled slug (current code resolves by `id`
    outside the seed upsert — keep it that way).

```prisma
model Problem {
  // ...existing fields...
  slug        String
  createdById String?
  createdBy   User?          @relation(fields: [createdById], references: [id], onDelete: SetNull)
  groups      GroupProblem[]
  @@unique([createdById, slug])
}
```

### 1.2 New Group + membership + activation

```prisma
enum GroupVisibility { PRIVATE SHARED }

model Group {
  id            String          @id @default(cuid())
  key           String?         @unique   // deterministic identity for system groups ("neetcode-150"); null for user groups
  ownerId       String?                   // null = system/curated owner
  owner         User?           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  visibility    GroupVisibility @default(PRIVATE)
  name          String
  description   String?
  sourceGroupId String?                   // provenance breadcrumb for duplicates
  createdAt     DateTime        @default(now())
  problems      GroupProblem[]
  activations   GroupActivation[]
  @@index([ownerId])
  @@index([visibility])
}

model GroupProblem {
  groupId   String
  problemId String
  addedAt   DateTime @default(now())
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  problem   Problem  @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@id([groupId, problemId])
  @@index([problemId])   // reverse lookup + per-problem EXISTS
}

model GroupActivation {
  userId  String
  groupId String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([userId, groupId])
  @@index([userId])
}
```

Add to `User`: `groupsInitialized Boolean @default(false)` — set `true` once the default
activation is written (signup or backfill). Gates the `activeCardWhere` fallback (§2).

`Card` is **UNCHANGED**. SM-2 state stays per `(userId, problemId)`; a card surfaces when its
problem is in any *active, still-visible* group.

### 1.3 Authorization contract (the key rules)

- `key` gives system groups deterministic identity so seed/backfill/signup are idempotent.
- **Visibility, not existence, gates read.** `activateGroup`/`duplicateGroup`/`studyGroup` MUST
  gate on `(group.visibility === SHARED || group.ownerId === userId)`. Never gate on existence
  alone; never equate `ownerId = null` with "shared."
- **Editable iff `problem.createdById === userId` (and thus `!== null`).** Curated problems are
  read-only for everyone.
- **Activate** = insert a `GroupActivation` row (after the visibility check), then materialize
  that group's cards via scoped `ensureCards(userId, problemIds)`.
- **Duplicate (deep-copy; curated-only; transactional).** Restricted to **system-curated SHARED
  groups** (`source.ownerId === null && source.visibility === SHARED`). In one `$transaction`:
  1. Create owned `Group { ownerId: userId, visibility: PRIVATE, sourceGroupId: source.id, name: <disambiguated copy-name> }`.
  2. For each source `GroupProblem`, create a new `Problem { createdById: userId, slug: cuid(), <deep-copied title/prompt/approach/source/url/tags> }`.
  3. Create a `GroupProblem` linking the new group to each new problem.
  4. For each new problem, create a `Card` for the user, **carrying over SM-2 state** from the
     user's existing card on the *source* curated problem if one exists (so progress isn't lost);
     otherwise default SM-2. The source card is left intact for the still-shared curated group.
  - The new group is created **inactive** (`PRIVATE`, no activation row). The user activates it
    when ready. **Note the double-review caveat:** if the user keeps both the curated NeetCode 150
    group and its duplicate active, the same underlying problem surfaces as two separate cards.
    The UI nudges the user to deactivate the source after duplicating (§3).
  - User-authored SHARED groups are not duplicatable in v3 (see Deferred).
- **Removing a problem from a group** deletes the `GroupProblem` row only. The `Card` and its
  history survive (keyed on `(userId, problemId)`). Re-adding reattaches the existing card via
  `@@unique([userId, problemId])` — surfaced in the UI as "your progress is kept."
- **`GroupProblem` FKs both `onDelete: Cascade`** — deleting a group cascades only its join rows,
  never `Card`/`ReviewLog`.
- **System groups are immutable via actions:** `ownerId = null`, so every `ownerId === userId`
  ownership check fails closed.

---

## 2. Review-flow changes

The single source of truth for the active-group filter is a composable Prisma `where`-fragment,
**not** a materialized id array (an array is an N-row fetch + an unbounded `IN`, and a correctness
footgun):

```ts
// lib/active-cards.ts — server-only; derived purely from the authenticated userId.
export function activeCardWhere(userId: string): Prisma.CardWhereInput {
  return {
    userId,
    problem: {
      groups: {
        some: {
          group: {
            activations: { some: { userId } },
            OR: [{ visibility: "SHARED" }, { ownerId: userId }], // tolerate revoked sharing
          },
        },
      },
    },
  };
}
```

Compiles to a correlated `EXISTS` walking `GroupActivation(userId) → Group → GroupProblem → Problem`,
composing with the existing `Card @@index([userId, dueAt])`. `GroupActivation`'s PK
(`@@id([userId, groupId])`, userId-leading) + `@@index([userId])` serve the activation join;
`GroupProblem @@index([problemId])` serves the per-problem direction. Never accepts a client
`groupId` on the today/review path.

**Fallback (gated by `groupsInitialized`):** when `user.groupsInitialized === false`,
`activeCardWhere` falls back to `{ userId, problem: { createdById: null } }` (all curated content),
reproducing today's behavior for any un-backfilled user. Because the gate is the *flag* (not a raw
activation count), a user who deliberately deactivated to zero (`groupsInitialized === true`)
correctly gets an empty pile rather than the curated set resurfacing.

### Concrete call-site changes (corrected to the real code)

- **`ensureCards`:** the per-load global calls in **`app/today/page.tsx:25` AND
  `app/review/page.tsx:25` are BOTH removed.** Replace global `ensureCards(userId)` with a scoped
  `ensureCards(userId, problemIds)` (`createMany({ skipDuplicates: true })`, safe via
  `@@unique([userId, problemId])`). It fires from: `activateGroup`, `addProblemToGroup` /
  `createProblemInGroup` (when the target group is active), `duplicateGroup`, signup, and seed/backfill.
  **Plus a narrow self-heal:** on the today/review path, an EXISTS-bounded
  `createMany({ skipDuplicates })` materializes any active-group problems the user is missing —
  cheap, idempotent, and it covers new curated problems seeded after activation and any
  half-succeeded backfill.
- **Review queue (the real location):** spread `activeCardWhere(userId)` into **both
  `prisma.card.findFirst` branches (ahead + due) and the `dueCount` in `app/review/page.tsx`.**
  `startSessionAction` (`app/today/actions.ts`) selects no cards (it deletes the skip-cookie and
  redirects) — do not edit it for scoping. There is no separate `force=1` query.
- **`today/page.tsx` counts** (`dueRowsCount`, `dueSoonCount`, `nextDue`): spread
  `activeCardWhere(userId)` into each.
- **Zero-active / done-state:** compute the zero-active branch from the **effective post-fallback
  active set** — a single existence query through `activeCardWhere` ("does the user have ANY
  active-set card?") — NOT a raw `activeGroupCount`. This keeps the done-state CTA and the
  review-queue emptiness in agreement. `hasAnyCards` (`card.count({ where: { userId } })`) is kept
  only to distinguish "brand-new user" copy from "deactivated everything" copy; it is no longer the
  empty-queue trigger.
- **`gradeCard`:** **unchanged** — grading any owned `Card` stays allowed (no membership re-check
  on the hot write path). The streak counts any review of any surfaced card; grading a deactivated
  card the user owns is benign and cannot be gamed. A negative test documents this as intentional.
- **Streak:** unchanged. `computeStreak`, `lib/streak.ts`, `ReviewLog`/`StreakFreeze` raw SQL untouched.
- **`dailyReviewCap`:** global, `Math.min(dueRowsCount, cap)` across the merged active pile.
- **Orphaned-card counter:** `card.count` where `userId AND NOT(active-membership EXISTS)` — the
  negation of `activeCardWhere`, reusing the same join.

**Performance acceptance gate (Step 2):** `EXPLAIN ANALYZE` the today `dueRowsCount` for a default
150-card user; require the planner to drive on `Card(userId, dueAt)` with the membership `EXISTS`
as a semi-join (no seq scan on `Card`), with a concrete p95 target. If the plan is bad, the named
fallback is a per-request materialized active-problem-id set, or a denormalized membership table.
Step 2 does not merge on functional tests alone.

---

## 3. UI

Server components + server actions, existing Tailwind tokens.

- **`/groups` manage page:** lists your groups (owned + activated) with due counts and an active
  toggle; a `createdAt`/last-edited secondary line per row so same-named copies stay distinguishable;
  a **Browse** section listing `visibility = SHARED` groups; an **orphaned-card counter**
  ("N cards in no active group") linking to a list of the actual orphaned problems, each with a
  per-card "Add to a group" action.
- **Browse decision point:** Activate is **primary**; **"Make my own copy"** is shown only on
  curated (`ownerId === null`) SHARED groups, as a secondary action behind "Want to edit these
  cards?". Truthful one-line consequence copy:
  - Activate → "Study now. Cards stay read-only and reflect the latest curated version."
  - Make my own copy → "Creates your own editable copy of all these cards. Your progress carries
    over. Fully independent — edits here don't touch the original."
  - After a successful duplicate, prompt: "Copied. Deactivate the original NeetCode 150 so you
    don't review cards twice?" with a one-click deactivate.
  - Auto-disambiguate the copy name `(copy)`/`(copy 2)`… by counting the user's owned groups whose
    name starts with the source name.
- **`/groups/[id]` detail:**
  - **Owned:** rename/describe; list cards; **one primary "Add card"** (authoring prompt/approach/
    tags); a secondary "add one you already wrote" picker shown **only when the user owns reusable
    problems**; remove card (reassurance "your progress is kept"); **"Study this group"** shown
    **only when the group is already active** (a filtered view of the active pile).
  - **Shared/system:** read-only view; Activate; **Make my own copy only if curated**.
  - `deleteGroup` confirm names the consequence: "This removes the group. Your N cards and their
    review history are kept and can be added to another group."
- **`/today`:** a labeled **Groups nav item** as the primary discovery path; the zero-active done
  variant (selected by the effective-active-set check) links to `/groups`; the "Add a group to
  study more" nudge shows **only in truly-nothing-to-do done variants**, never alongside the
  "Review N due soon" CTA.
- **Focus session route:** requires `auth()` + `(visibility === SHARED || ownerId === userId)` AND
  an existing `GroupActivation(userId, groupId)`; scopes membership to that one `groupId` AND
  `userId`. No card-creation path here (cards already exist via activation).

### Per-action authorization (the security contract)

Every action in `app/groups/actions.ts` is `auth()` + the predicate below. Helpers
`assertOwnedGroup(userId, groupId)` and `assertOwnedProblem(userId, problemId)` mirror the existing
`gradeCard` pattern (`auth()` → explicit equality → mutate).

| Action | Predicate |
|---|---|
| `createGroup` | authed; `rateLimit()`; per-user owned-group cap |
| `renameGroup` / `deleteGroup` | `group.ownerId === userId` (system groups never match) |
| `activateGroup` / `deactivateGroup` | `group.visibility === SHARED \|\| group.ownerId === userId`; activation row scoped by `userId`; activate runs scoped `ensureCards` |
| `duplicateGroup` | **`source.ownerId === null && source.visibility === SHARED`** (curated only); `rateLimit()`; single `$transaction`; bounded member count |
| `studyGroup` (focus) | `(group.visibility === SHARED \|\| group.ownerId === userId)` AND existing `GroupActivation(userId, groupId)`; query scoped to that `groupId` AND `userId` |
| `addProblemToGroup` | `group.ownerId === userId`; fetch problem by id and **REJECT unless `createdById === null \|\| createdById === userId`** before any insert |
| `createProblemInGroup` | `group.ownerId === userId`; `rateLimit()`; per-user problem cap; new `Problem` gets `createdById = userId`, `slug = cuid()`; scoped `ensureCards` if group active |
| `removeProblemFromGroup` | `group.ownerId === userId` (group-owner, NOT problem-owner) |
| `editProblem` | `assertOwnedProblem`: reject if `createdById === null \|\| createdById !== userId`. Owned problems only — no fork branch (deep-copy model). |
| `gradeCard` | **unchanged**: `card.userId === userId` only (intentional) |

---

## 4. Migration & seed

- **Schema apply:** this repo uses `prisma db push` (no migration files). Changes are additive:
  `Problem.createdById` + `createdBy onDelete: SetNull`; swap `slug @unique` →
  `@@unique([createdById, slug])`; `User.groupsInitialized`; `Group` (+ `key`, `visibility`);
  `GroupProblem`; `GroupActivation`; all indexes and `onDelete` rules. Optionally a partial unique
  index on `Problem(slug) WHERE createdById IS NULL`.
- **Seed (idempotent, ordered):**
  1. **Upsert curated problems via find-then-write** (NOT a composite-unique upsert). Prisma rejects
     `where: { createdById_slug: { createdById: null, ... } }` — a compound-unique selector can't take
     a NULL component (SQL NULLs aren't valid unique selectors). So per problem: `findFirst({ where:
     { createdById: null, slug } })` → `update({ where: { id } })` if found, else `create({ data: {
     ...p, createdById: null } })`. Idempotent; preserves Problem ids so Cards/ReviewLogs don't
     cascade-delete.
  2. **Stale-deletion scoped to curated:**
     `deleteMany({ where: { slug: { notIn: keepSlugs }, createdById: null } })`. User-authored
     problems are never touched.
  3. Upsert the system group by `key`:
     `Group { key: "neetcode-150", ownerId: null, visibility: SHARED, name: "NeetCode 150" }`.
  4. Attach all 150 curated problems via `GroupProblem` (`skipDuplicates`).
  5. **Re-run the scoped card-ensure for every user activated on the system group** so newly-added
     curated problems materialize for existing activated users — keeps "today unchanged" true past t=0.
- **Backfill (after the group exists):** for every existing user, insert
  `GroupActivation(userId, neetcode-150)`, run scoped `ensureCards(userId, <150 problemIds>)`, and
  set `groupsInitialized = true`. Idempotent and re-runnable. **Deploy checklist asserts:**
  (a) `GroupActivation` count for the system group == existing user count, AND (b) every activated
  user has the expected card count. Missed users are kept correct by the flag-gated fallback + self-heal.
- **Signup (exact, implementable shape):**
  ```ts
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ /* ... */ });
    const g = await tx.group.findUnique({ where: { key: "neetcode-150" } });
    if (g) {
      await tx.groupActivation.create({ data: { userId: u.id, groupId: g.id } });
      await tx.card.createMany({ data: /* 150 problemIds → {userId,problemId} */, skipDuplicates: true });
      await tx.user.update({ where: { id: u.id }, data: { groupsInitialized: true } });
    }
    return u;
  });
  // keep the existing P2002 try/catch AROUND this $transaction → /signup?error=signup_failed (no enumeration leak)
  // signIn("credentials", { redirectTo: "/review" }) is called AFTER the transaction commits — never inside it.
  ```
  - `signIn` re-queries the DB and throws `NEXT_REDIRECT`; it **cannot** live inside the
    transaction. The 150-row `createMany` commits before the redirect, so the first `/review` is
    non-empty.
  - **Missing system group is tolerated** (`if (g)` skip): the user is created without activation,
    `groupsInitialized` stays `false`, and the fallback yields the curated pile — signup never
    500s on a missing seed.
- `createdById` backfills to `null` on existing problems (stay shared/read-only).

---

## 5. Sequencing

Each step independently mergeable; the review flow stays green throughout.
Effort: **Step 0 ~M (hard blocker)**, Step 1 ~M, Step 2 ~M-L, Step 3 ~M, Step 4a ~S, Step 4b ~L,
Step 5 ~S-M (smaller now — no fork-on-edit).

0. **DB-backed integration-test infra (hard blocker, ~M — currently missing).** Repo `lib/*.test.ts`
   are pure-function vitest with zero Prisma. Stand up a real-Postgres harness (container or
   ephemeral schema), apply migrations, decide per-test isolation up front
   (transaction-rollback vs truncate — note the `gradeCard` `FOR UPDATE`/`$transaction`
   interaction), seed fixtures, and wire **Postgres into CI**. Gating dependency for Steps 2/3/5.

1. **Schema + migration + seed/backfill + signup activation** (data layer first). Includes the
   composite-unique seed upsert, `groupsInitialized`, `createdBy onDelete: SetNull`, the exact
   `$transaction` signup shape, and missing-system-group tolerance. Land signup default-activation
   in the same change as the backfill so there's no window where new users get no group.
   **Acceptance:** a freshly-signed-up user has 150 cards and a non-empty `/review`; signup succeeds
   when the system group is absent.

2. **`activeCardWhere` fragment + scope the REAL call-sites** (`review/page.tsx` both `findFirst` +
   `dueCount`; `today/page.tsx` counts), remove BOTH per-load `ensureCards`, add scoped
   `ensureCards`/self-heal, flag-gated fallback, effective-active-set done-state. **Performance gate
   is an acceptance criterion.** Tests: scoped ensure materializes only active-group problems and is
   idempotent; today counts match pre-feature values for a default 150-user; the review queue picks
   only active-group cards; zero-active → empty queue + zero-active done-state; a user with history
   but all groups deactivated (`groupsInitialized=true`) hits zero-active (not "caught up"); a
   `groupsInitialized=false` user gets the curated pile via fallback; `activeCardWhere(userA)` never
   returns userB's or private-group problems; a new curated problem added later to an activated user
   eventually materializes (self-heal/seed re-ensure).

3. **Group server actions + ownership guards.** DB negative tests: non-owner cannot
   edit/remove/delete another user's problem or group; a PRIVATE group cannot be
   activated/duplicated by another user; a user-authored SHARED group cannot be duplicated; a system
   group cannot be deleted/renamed; two same-titled authored problems by one user both insert;
   seeding does not delete user-authored problems; `addProblemToGroup` rejects (not skips) another
   user's authored `problemId` with no content exposure; `gradeCard` on a deactivated owned card
   succeeds (documented intentional).

4a. **Read-only `/groups` + `/groups/[id]` detail + activate/deactivate.** Ships browsing value
    immediately. Includes the orphaned-card list with per-card re-add and the Groups nav item.

4b. **Owned-group authoring:** `createProblemInGroup`, `editProblem` (owned problems only),
    `removeProblemFromGroup`, add-existing picker, rename/describe, delete with consequence-naming
    confirm. **"Study this group" focus session, offered only for already-active groups**, with the
    focus-route predicate.

5. **Browse catalog + Duplicate (deep-copy, curated-only).** Tests: duplicating creates owned copies
   of all problems (`createdById = userId`, fresh `cuid` slugs) and carries over SM-2 state from the
   user's source cards; the curated source group/problems/cards are unaffected; the new group is
   PRIVATE/inactive; the post-duplicate "deactivate original?" prompt works; B cannot duplicate a
   user-authored SHARED group; deleting user A (`SetNull`) leaves curated/other-user content intact;
   duplicate is rate-limited and bounded.

---

## Consciously deferred

- **URL/LLM import** — out of scope by user decision; its own later spec. The opaque-`cuid` slug
  scheme leaves a clean dedupe seam.
- **Copy-on-write / fork-on-edit Duplicate** — explicitly rejected in favor of plain deep-copy
  (user decision). Deep-copy costs ~150 duplicated rows per duplicated group (acceptable at this
  scale) and buys a far simpler, fully-independent ownership model.
- **Duplicating user-authored (non-curated) SHARED groups** — restricted out to avoid cross-user
  cascade exposure and provenance/update-tracking complexity. Revisit if peer-sharing of authored
  decks becomes a goal.
- **Per-user storage caps as hard quotas beyond rate limits** — `rateLimit()` + simple per-user
  caps now; richer quota/billing deferred (low value pre-launch).
- **A global cross-group card library / browser** — "add existing" is limited to problems the user
  owns plus the orphaned-card re-add list.
- **A visible "this curated card was updated" affordance** — softened Activate copy sets neutral
  expectations; a change-notification affordance is deferred.
