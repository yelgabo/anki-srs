# Architecture review & plan of attack — 2026-07-10

A full adversarial review ("grill") of the repo as of `ee52e55`, run across four dimensions in
parallel — architecture/layering, data-model/SRS/concurrency correctness, security/authz, and
testing/operations — plus a mechanical audit against the owner's code standards. Findings were
deduplicated across reviewers; the single most serious claim (C1, the timezone SQL inversion) was
re-verified empirically against PostgreSQL 17 before being accepted, and the security review
re-verified that every fix from the 2026-07-02 security audit actually holds in code (they do).

The architecture diagram lives alongside this document: [`architecture.drawio`](./architecture.drawio)
(editable) and [`architecture.drawio.png`](./architecture.drawio.png) (rendered, XML embedded). It was
refreshed as part of this review — the previous, never-committed version still showed the
`--accept-data-loss` start command that the security audit removed.

## Verdict

The bones are good. The layered design (thin `"use server"` wrappers → pure `userId`-scoped `lib/`
core → Prisma), the ownership-guard discipline, the deterministic-time testing, and the IDOR test
suite are all genuinely strong — the security reviewer confirmed the stored-XSS surface is closed
and found no authorization bypass. The problems cluster in three places:

1. **The one place the layering rule was broken is exactly where the bugs pooled.** `gradeCard`
   and `undoAction` hold the densest logic in the app (SM-2 apply, freeze-grant algorithm,
   `FOR UPDATE` transactions) inside `app/review/actions.ts`, where the Vitest DB harness cannot
   import them. Zero tests cover grading, freeze grants, or undo — and that untested block is
   where the two worst correctness bugs (C1, H2) live.
2. **Two data-destruction levers are armed.** The boot-time seed can silently cascade-delete user
   progress (C2), and every review of a non-UTC user is being day-keyed incorrectly (C1).
3. **The repo predates the current standards.** 2-space indentation throughout, 296 lines over
   100 columns, 102 braceless `if` statements, no formatter/linter at all, and no committed
   architecture diagram until now.

## Findings

Severity reflects user impact today, not theoretical risk. File references are to `main` at
`ee52e55`. "Reviewer" notes which dimension(s) found it — items found independently by two
reviewers were merged.

### Critical — real users are affected or one edit destroys data

**C1. Local-day SQL is timezone-inverted for every non-UTC user** (data-model; verified on
Postgres 17). Prisma stores `DateTime` as naive-UTC `timestamp(3)`, and
`date_trunc('day', "reviewedAt" AT TIME ZONE tz)` *interprets* that UTC wall time as being in the
user's zone — the opposite of converting to it. Verified: a review stored at `2026-07-10 03:00Z`
(8pm July 9 in Los Angeles) day-keys as **July 10**; correct is July 9. Consequences: streaks read
0 right after an evening review, `reviewDays` can contain "future" keys, and the freeze-grant gap
detection in `gradeCard` mixes these shifted days with correctly-local `StreakFreeze.usedOn` dates,
granting or withholding freezes on phantom gaps. It survived CI because every test user is UTC.
Fix is the classic double conversion — `"reviewedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz` — in both
sites: `app/review/actions.ts:79` and `app/today/page.tsx:55-61`. Better (also fixes M7): replace
the full-table `MAX(date_trunc(...))` scan with an index-backed `ORDER BY "reviewedAt" DESC LIMIT 1`
and compute the day key in JS with the already-correct `dayKey()` from `lib/timezone.ts`.

**C2. Boot-time seed stale-delete is a silent progress-wipe lever** (ops + data-model,
independently). `railway.json` runs `prisma/seed.ts` on **every boot**, and `seed.ts:25-29`
deletes any curated problem (`createdById: null`) whose slug is missing from `SEED_PROBLEMS`.
`Card.problem` and `ReviewLog.card` are `onDelete: Cascade` — so renaming or removing one slug in
`lib/seed-data.ts` deletes every user's SM-2 progress *and review history* for that problem on the
next deploy, with no warning. The `db push` data-loss guard added in the July audit does not cover
this; it is app-level. Related compounders: the seed also does O(users) `ensureCards` work per
restart, there is no `healthcheckPath`, and `restartPolicyMaxRetries: 3` means a transient DB blip
during seed can leave the app down.

### High — broken behavior or a missing safety net

**H1. gradeCard/undoAction business logic lives in the wrapper layer, untested** (architecture +
ops, independently). `app/review/actions.ts:31-146,184-233` contains the SM-2 apply, the raw-SQL
last-active-day query, the entire freeze-grant algorithm, leech recomputation (`lapses >= 8`
hardcoded twice), and the undo restore — behind `"use server"` + `next/headers` imports the Vitest
node loader can't resolve. The repo's own CLAUDE.md rule ("keep DB/business logic in `lib/`")
exists precisely because of this; the rule was followed everywhere except the most invariant-dense
code in the app. C1, H2, and H3 all live in this block and none could have a regression test today.

**H2. Double-grade race: SM-2 is computed from a stale snapshot** (data-model). The card is read
and `schedule()` applied *before* the `$transaction`; only the User row is locked. Two tabs grading
the same card both compute from the same base state — last writer wins, and two ReviewLog rows are
appended with identical `prev*` snapshots, inflating review counts and leaving a stale undo target.
Fix: lock or optimistically re-check the Card row inside the transaction.

**H3. Freeze-grant cap is bypassable across month boundaries, and freezes burn on unbridgeable
gaps** (data-model). The budget check counts freezes in the *current* month, but granted freezes
can be dated in the *previous* month (`app/review/actions.ts:89-111`) — a user who spent June's two
freezes gets two more June-dated ones on July 2. And `missed.slice(0, available)` burns the whole
budget even when the gap is too long to bridge, so the streak resets anyway. Fix: budget each
freeze against its own `usedOn` month, and grant all-or-nothing.

**H4. CI never runs `next build`; the UI has never been rendered anywhere** (ops). The workflow
gates on `tsc` + unit + DB tests. Client/server-boundary errors, serialization failures, and
route-config mistakes surface only on Railway. Combined with zero component/E2E tests and the
still-pending click-verification from CLAUDE.md, every page's first real render is in production.

**H5. `dailyReviewCap` and `?force=1` are fiction** (architecture + data-model, independently).
`/today` shows a capped count and a "Review them anyway →" escape hatch, but `/review` never
applies the cap and `ReviewCard` destructures only `{ card }` — its declared `force`/`ahead` props
are dead (`app/review/ReviewCard.tsx:20-21,44`). TECHNICAL.md documents behavior that doesn't
exist. Decision needed: enforce or delete (see plan P3).

**H6. Skip is a silent no-op in focus-study** (architecture). The study page reuses `ReviewCard`,
whose Skip calls `skipAction` — which writes the `m2_skip` cookie and revalidates `/review` only.
The study page's query never reads the skip cookie, so the same card re-renders, while the skip
list (32-slot FIFO) silently evicts legitimate `/review` skips.

### Medium

| # | Finding | Where | Reviewer |
|---|---------|-------|----------|
| M1 | `x-real-ip` trusted on an unverified assumption about Railway's edge; if the edge doesn't set it, any client spoofs fresh rate-limit buckets per request | `lib/get-client-ip.ts:15-16` | security |
| M2 | Rate-limit LRU eviction resets live buckets — spraying >10k keys evicts and resets a victim's per-email signin limit (the repo's own test demonstrates it); compounds with M1 | `lib/rate-limit.ts:48-53` | security |
| M3 | User deletion launders authored problems into the curated namespace: `createdById` → `SetNull` makes them look system-curated, adoptable by anyone, then purged by the next seed stale-delete | `prisma/schema.prisma:82` | data-model |
| M4 | `groupsInitialized=false` users get lying orphan counts: `/groups` and orphans hardcode `activeCardWhere(userId, true)` while `/today` honors the flag | `lib/group-views.ts:55-57`, `app/groups/orphans/page.tsx:16` | architecture |
| M5 | N+1 in `listGroupsView` — 1+2N sequential counts over the unbounded shared catalog | `lib/group-views.ts:36-57` | architecture |
| M6 | `/today` runs ~9 sequential round-trips and duplicates the streak-day raw SQL with `gradeCard` (streak read-model logic living in a page) | `app/today/page.tsx:23-63` | architecture |
| M7 | Last-active-day `MAX()` scans the user's entire (unbounded, never-pruned) ReviewLog on every grade, inside the serializing lock — grading latency grows forever; folds into the C1 fix | `app/review/actions.ts:77-84` | data-model |
| M8 | Wrapper inconsistencies: grade/skip **throw** on bad input while groups actions redirect; `skipAction` is the only unthrottled mutation; only rename Zod-parses its IDs (others pass raw `formData` strings, uncapped) | `app/review/actions.ts:44,152`, `app/groups/actions.ts:120-229` | architecture + security |
| M9 | The "no `next-auth`/`next/headers` in `lib/`" rule is broken inside `lib/` itself (`auth.ts`, `skip-cookie.ts`) — both consequently untested; skip-cookie ownership is split across three files with a duplicated `SKIP_COOKIE` constant | `lib/auth.ts:2-4`, `lib/skip-cookie.ts:4`, `app/review/actions.ts:25` | architecture |
| M10 | `--passWithNoTests` on the DB suite means a glob/config drift silently drops all 87 integration tests while CI stays green | `.github/workflows/test.yml:62` | ops |
| M11 | Lint is a false affordance: `"lint": "next lint"` with no eslint in the lockfile, no config, no CI step | `package.json:14` | ops |
| M12 | Security-critical pure functions with zero tests: `get-client-ip` (keys the credential-stuffing defense), `authorize()`'s dual rate-limit path, the timezone route | `lib/get-client-ip.ts`, `lib/auth.ts:35-71` | ops |
| M13 | No observability or backup story: no error monitoring, no alert on the C2 boot-failure mode, no documented `pg_dump`/PITR for the prod DB — notable given the migrations doc's data-loss thesis | repo-wide | ops |
| M14 | Runtime Node unpinned (`engines` absent; Railpack unpinned) — prod can run a different major than the CI-verified Node 22 | `package.json` | ops |

### Low

Grouped; all are cheap, none urgent. **Schema:** missing FK indexes (`ReviewLog.cardId`,
`Card.problemId`) make every cascade delete a seq-scan; two redundant indexes (`StreakFreeze`,
`GroupActivation`) are pure write overhead; `Group.sourceGroupId` is a bare string with no FK.
**Review flow:** undo doesn't revert freezes granted by the undone grade; `leech` is a dead flag
with its threshold duplicated in the action layer; the "+1 (auto-freeze)" projected hint is
unreachable code (`lib/streak.ts:93-95`); no maximum-interval clamp; `longest` streak only sees the
400 most recent review days. **Groups:** `duplicateGroup` has a TOCTOU on caps/names and ~450
sequential queries inside a default-timeout transaction; `GroupError("invalid_problem")` conflates
bad-URL, empty-name, and a forbidden-authorization case. **Security hygiene:** skip cookie carries
`iat` but never expires; `/api/user/timezone` relies on incidental CSRF protection; no security
headers in `next.config.ts`; deep import from `next/dist/...` in `app/signin/actions.ts:4`.
**Structure:** `UndoButton` issues its own Prisma query from a leaf component with the 30s window
duplicated; `groupDetailView` maps rows down then the page re-fetches them; the signin Zod schema
is duplicated byte-for-byte; `focusGroupCardWhere` lives in the write/guard module instead of
`active-cards.ts`; `app/review/queue.db.test.ts` is a lib test parked in `app/`. **Hygiene:**
`test-results/` untracked and not gitignored (fixed in this commit); `@types/bcryptjs` in
`dependencies`; CI double-runs per PR commit with no concurrency cancellation; TECHNICAL.md drift
(`ensureCards` wrapper that doesn't exist, done-copy "A–E" vs actual A–F).

### Standards audit (owner's global standards)

| Standard | Status |
|----------|--------|
| 4-space indent, all languages | **Violated everywhere** — the entire repo is 2-space |
| 100-column limit | **296 violations** (176 in `lib/seed-data.ts` content strings) |
| Braces on every `if` | **102 braceless single-line `if`s** |
| Formatter/linter enforcing the above | **None exists** (no prettier, no eslint, dead `lint` script) |
| Plans in `.md` + draw.io diagram committed alongside | Plans/specs are in md ✓, but **no diagram was ever committed**; the one that existed was untracked and stale. Fixed for the architecture diagram in this commit; the card-groups spec still has no diagram |

### Genuinely well done — do not regress these

- `lib/active-cards.ts` (`activeCardWhere`) as the single scope authority every read path composes.
- The ownership-guard discipline and the 494-line adversarial IDOR suite; the security reviewer
  confirmed every 2026-07-02 audit fix holds (URL sanitization on all write paths, JSX-only
  rendering, timing-equalized auth, textbook HMAC cookie with `timingSafeEqual`).
- Deterministic time injection everywhere (`now` params, no fake timers) — including genuinely hard
  timezone edges in tests; `lib/timezone.ts` itself is DST-safe by construction (C1 is in raw SQL
  that bypassed it).
- Undo is exactly reconstructible: post-fuzz intervals + `prev*` snapshots + 3-decimal rounding
  make restore bit-exact.
- The destructive-reset safety chain in the test harness, and the `db push` guard + migrations doc.

## Plan of attack

Ordered by risk-retired-per-effort. Each phase is independently shippable; per repo convention,
each gets its own implementation plan in `docs/superpowers/plans/` (with diagram, per the
standard) before code. P0 is small and surgical — do it before any feature work. P3 needs owner
decisions first (table below).

**P0 — stop the bleeding (correctness + data safety).**
1. Fix the timezone SQL in both sites; while there, replace the `MAX()` full-scan with
   `ORDER BY reviewedAt DESC LIMIT 1` + JS `dayKey()` (C1, M7). Add DB tests with a non-UTC user
   and an evening-local review — the test gap that let this survive.
2. Defuse the seed: gate the stale-delete behind an explicit env flag (mirroring the `anki_test`
   guard pattern), log what it *would* delete otherwise; add `healthcheckPath` to `railway.json`;
   move `db:seed` out of the boot path to a deliberate deploy step (C2). One `pg_dump` of prod
   before any of this lands (M13's cheapest slice).
3. Extract `lib/review.ts` — `gradeCardTx`, `undoLastReview`, `latestUndoableLog`, a single
   `LEECH_THRESHOLD` — leaving wrappers as auth/limit/parse/redirect only (H1). DB-test the
   extracted core: freeze grants (incl. month-boundary, H3), undo, and the double-grade race with
   a Card-row lock or optimistic re-check (H2). This is the largest P0 item and the enabler for
   every future review-flow change.

**P1 — make CI catch what it currently can't.** Add `next build` to the workflow (H4); drop
`--passWithNoTests` (M10); pin `engines`/Railpack Node (M14); add workflow `concurrency`
cancellation; unit-test `get-client-ip`, `authorize`, `skip-cookie` (M12, M9's testability half).

**P2 — security tightening.** Empirically verify what Railway's edge sets (`curl` an
echo-headers route on the deploy), then drop or justify `x-real-ip` (M1); make the rate limiter
refuse to evict live over-limit buckets (M2); Zod-parse every action ID (M8); explicit Origin
check on the timezone route; security headers in `next.config.ts`; skip-cookie max age.

**P3 — product-behavior decisions, then small fixes.** Each is quick once decided:

| Decision | Options (recommendation first) |
|----------|-------------------------------|
| `dailyReviewCap` (H5) | Enforce in `/review` with `?force=1` honored — or delete the cap, the link, and the dead props |
| Skip in focus-study (H6) | Hide the Skip button in focus mode — or make the study query read the skip cookie |
| Freeze semantics (H3b) | All-or-nothing gap bridging — or keep partial-burn and document it |
| Undo vs freezes | Leave granted freezes (document the ratchet) — or revert freezes created in the undone grade's window |
| Deleted user's problems (M3) | `onDelete: Cascade` for authored problems — or a sentinel distinct from `null` |
| Leech flag | Keep display-only and say so — or implement suspend/bury |

**P4 — standards migration (one big mechanical commit).** Add Prettier (4-space, `printWidth: 100`)
+ ESLint flat config with `curly: "all"`, wire `lint` into CI, then a single `chore: reformat`
commit — done when the tree is otherwise quiet, so it doesn't poison diffs. Also: fix
TECHNICAL.md drift; dedupe `SKIP_COOKIE`/signin-schema/undo-window constants; replace the
`next/dist` deep import; move `@types/bcryptjs` to devDependencies. Optionally backfill a diagram
for the card-groups spec; the standard binds all future plans.

**P5 — scale and polish (when it starts to hurt or before inviting users).** Batch the
`listGroupsView` counts (M5); `Promise.all` + a shared `lib/streak-data.ts` for `/today` (M6);
thread the real `groupsInitialized` flag through group views (M4); add the missing FK indexes and
drop the redundant ones; batch `duplicateGroup` with `createMany`; adopt real migrations per
`docs/deployment-db-migrations.md` (pairs naturally with P0.2); pick an error-monitoring story.
