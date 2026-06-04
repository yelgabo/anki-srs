# Card Groups — Plan 1 of 3: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data model, seed/backfill/signup, and review-flow scoping for card groups, with a DB-backed test harness — all while keeping today's review behavior byte-for-byte unchanged.

**Architecture:** Add `Group` / `GroupProblem` / `GroupActivation` models and `Problem.createdById` ownership. Replace the global "every problem becomes a card" behavior with a `where`-fragment (`activeCardWhere`) that scopes a user's queue to problems in their *active* groups. A `groupsInitialized` flag drives a fallback so un-backfilled users keep seeing the curated set. NeetCode 150 becomes a default-active shared system group, so behavior is identical at t=0.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + PostgreSQL, vitest 4, `prisma db push` (no migration files in this repo).

**Spec:** `docs/superpowers/specs/2026-06-04-card-groups-design.md`. This plan implements spec **Steps 0, 1, 2** only. Plan 2 (server actions + ownership guards, spec Steps 3/4a/4b) and Plan 3 (UI + Duplicate, spec Step 5) follow.

**Scope note:** This is one coherent, independently-shippable slice. After it merges, the app behaves exactly as today, but the data layer and queue scoping are group-aware and fully tested — the prerequisite for the user-facing group features in Plans 2–3.

---

## File structure

**Test harness (new):**
- `vitest.config.ts` — two projects: `unit` (pure fns, no DB) and `db` (Postgres-backed).
- `.env.test` — test `DATABASE_URL` (gitignored).
- `test/db/global-setup.ts` — push schema to the test DB once per run.
- `test/db/setup.ts` — per-test truncation + Prisma disconnect, registered for the `db` project only.
- `test/db/factory.ts` — `makeUser()` and small builders for tests.
- `docker-compose.test.yml` — optional local Postgres for running the `db` project.

**Schema & data (modified):**
- `prisma/schema.prisma` — new models, `Problem.createdById`, composite slug unique, `User.groupsInitialized`.
- `prisma/seed.ts` — composite upsert, curated-scoped stale-delete, system group + membership, re-ensure.
- `prisma/backfill-groups.ts` (new) — one-shot backfill for existing users.

**Domain logic (new/modified):**
- `lib/groups.ts` (new) — `SYSTEM_GROUP_KEY`, `ensureCards(userId, problemIds)` (moved + scoped), `defaultActivationProblemIds()`.
- `lib/active-cards.ts` (new) — `activeCardWhere(userId, groupsInitialized)` + `hasAnyActiveCard(userId, ...)`.
- `app/review/actions.ts` — drop the global `ensureCards`; re-export the scoped one from `lib/groups.ts` or update callers.
- `app/review/page.tsx` — scope both `findFirst` branches + `dueCount`; self-heal; remove per-load global ensure.
- `app/today/page.tsx` — scope all counts; effective-active-set done-state; remove per-load global ensure.
- `app/signup/actions.ts` — transactional default activation before `signIn`.
- `lib/done-copy.ts` + `lib/done-copy.test.ts` — new `zero-active` variant.

---

## Task 0.1: DB-backed test harness

**Files:**
- Create: `vitest.config.ts`, `.env.test`, `test/db/global-setup.ts`, `test/db/setup.ts`, `test/db/factory.ts`, `docker-compose.test.yml`
- Modify: `.gitignore`, `package.json`

- [ ] **Step 1: Add an optional local test Postgres**

Create `docker-compose.test.yml`:

```yaml
services:
  test-db:
    image: postgres:16
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: anki_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data   # ephemeral, fast
```

Create `.env.test`:

```
DATABASE_URL="postgresql://test:test@localhost:5433/anki_test"
AUTH_SECRET="test-secret-not-for-prod"
AUTH_TRUST_HOST="true"
```

- [ ] **Step 2: Gitignore the test env and wire scripts**

Append to `.gitignore`:

```
.env.test
```

In `package.json` `scripts`, add (keep the existing `"test": "vitest run"`):

```json
"test:db:up": "docker compose -f docker-compose.test.yml up -d",
"test:db:down": "docker compose -f docker-compose.test.yml down",
"test:unit": "vitest run --project unit",
"test:db": "vitest run --project db"
```

- [ ] **Step 3: Write the vitest config with two projects**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Pure-function tests — no DB, no setup. The existing lib/*.test.ts.
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
          exclude: ["lib/**/*.db.test.ts"],
          environment: "node",
        },
      },
      {
        // DB-backed integration tests — *.db.test.ts anywhere.
        test: {
          name: "db",
          include: ["**/*.db.test.ts"],
          environment: "node",
          env: loadEnvTest(),
          globalSetup: ["./test/db/global-setup.ts"],
          setupFiles: ["./test/db/setup.ts"],
          fileParallelism: false, // serialize DB tests; shared schema, truncate between tests
        },
      },
    ],
  },
});

// Minimal .env.test loader (avoids adding a dotenv dependency).
function loadEnvTest(): Record<string, string> {
  const fs = require("node:fs");
  const out: Record<string, string> = {};
  if (!fs.existsSync(".env.test")) return out;
  for (const line of fs.readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
```

- [ ] **Step 4: Write the global setup (push schema once)**

Create `test/db/global-setup.ts`:

```ts
import { execSync } from "node:child_process";

// Runs ONCE before the db project. Force-resets the test DB to the current
// schema.prisma. Uses db push because this repo has no migration files.
export default function setup() {
  if (!process.env.DATABASE_URL?.includes("anki_test")) {
    throw new Error(
      `Refusing to run DB tests: DATABASE_URL is not a test DB (${process.env.DATABASE_URL}). ` +
        `Set .env.test to a database named anki_test.`,
    );
  }
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });
}
```

- [ ] **Step 5: Write the per-test setup (truncate + disconnect)**

Create `test/db/setup.ts`:

```ts
import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

// Truncate all domain + auth tables before each test. RESTART IDENTITY + CASCADE
// keeps it order-independent. _prisma_migrations is absent (db push), so we list tables dynamically.
beforeEach(async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 6: Write the test factory**

Create `test/db/factory.ts`:

```ts
import { prisma } from "@/lib/db";

let n = 0;
export async function makeUser(overrides: { groupsInitialized?: boolean } = {}) {
  n += 1;
  return prisma.user.create({
    data: {
      email: `u${n}-${process.pid}@test.local`,
      passwordHash: "x",
      groupsInitialized: overrides.groupsInitialized ?? false,
    },
  });
}

export async function makeProblem(slug: string, createdById: string | null = null) {
  return prisma.problem.create({
    data: {
      slug,
      createdById,
      title: slug,
      source: "test",
      prompt: `prompt ${slug}`,
      approach: `approach ${slug}`,
      tags: [],
    },
  });
}
```

> Note: `makeUser` and `makeProblem` reference `groupsInitialized` and `createdById`, which Task 1.1 adds to the schema. This file is created here but its first *use* is in Task 0.2's smoke test, which runs after Task 1.1. If you execute strictly in order, write Task 1.1 before running any `db` test. (Subagent-driven execution handles this via the task order.)

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts test/db docker-compose.test.yml .gitignore package.json
git commit -m "test: add DB-backed vitest harness (db project, truncate isolation)"
```

---

## Task 1.1: Schema — ownership, groups, activation

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `createdById` + composite slug to `Problem`**

In `prisma/schema.prisma`, replace the `Problem` model's `slug` line and add ownership. The `slug` line changes from `slug String @unique` to `slug String`, and these are added:

```prisma
model Problem {
  id          String         @id @default(cuid())
  slug        String
  title       String
  source      String
  url         String?
  prompt      String         @db.Text
  approach    String         @db.Text
  tags        String[]
  createdById String?
  createdBy   User?          @relation("AuthoredProblems", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime       @default(now())

  cards  Card[]
  groups GroupProblem[]

  @@unique([createdById, slug])
}
```

- [ ] **Step 2: Add the group models + enum**

Append to `prisma/schema.prisma` (after `Problem`):

```prisma
enum GroupVisibility {
  PRIVATE
  SHARED
}

model Group {
  id            String          @id @default(cuid())
  key           String?         @unique
  ownerId       String?
  owner         User?           @relation("OwnedGroups", fields: [ownerId], references: [id], onDelete: Cascade)
  visibility    GroupVisibility @default(PRIVATE)
  name          String
  description   String?
  sourceGroupId String?
  createdAt     DateTime        @default(now())

  problems    GroupProblem[]
  activations GroupActivation[]

  @@index([ownerId])
  @@index([visibility])
}

model GroupProblem {
  groupId   String
  problemId String
  addedAt   DateTime @default(now())

  group   Group   @relation(fields: [groupId], references: [id], onDelete: Cascade)
  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)

  @@id([groupId, problemId])
  @@index([problemId])
}

model GroupActivation {
  userId  String
  groupId String

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  group Group @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([userId, groupId])
  @@index([userId])
}
```

- [ ] **Step 3: Add the back-relations + flag to `User`**

In the `User` model, add these relation fields and the flag (alongside the existing `cards`, `reviews`, `streakFreezes`):

```prisma
  groupsInitialized Boolean          @default(false)
  authoredProblems  Problem[]        @relation("AuthoredProblems")
  ownedGroups       Group[]          @relation("OwnedGroups")
  activations       GroupActivation[]
```

- [ ] **Step 4: Apply to dev DB and regenerate client**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." and the Prisma Client regenerates without type errors.

> If `db push` warns about the `slug` unique change on existing data, that is expected — the curated rows all have `createdById = NULL`, so `(NULL, slug)` pairs stay unique. Accept the change.

- [ ] **Step 5: Verify the client typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors (existing code still compiles; `Problem` still has `slug`, just non-unique).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add Group/GroupProblem/GroupActivation + Problem ownership"
```

---

## Task 0.2: Smoke-test the harness

**Files:**
- Create: `test/db/harness.db.test.ts`

- [ ] **Step 1: Write a DB smoke test**

Create `test/db/harness.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "./factory";

describe("db harness", () => {
  it("starts empty each test (truncation works)", async () => {
    expect(await prisma.user.count()).toBe(0);
    await makeUser();
    expect(await prisma.user.count()).toBe(1);
  });

  it("is isolated from the previous test", async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it("can create a curated problem and a group", async () => {
    const p = await makeProblem("two-sum", null);
    const g = await prisma.group.create({
      data: { key: "g1", ownerId: null, visibility: "SHARED", name: "G1" },
    });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    const count = await prisma.groupProblem.count({ where: { groupId: g.id } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Bring up the test DB and run it**

Run:
```bash
npm run test:db:up
npm run test:db
```
Expected: 3 passing tests. The first run prints the `prisma db push --force-reset` output from global-setup.

- [ ] **Step 3: Confirm the unit project is untouched**

Run: `npm run test:unit`
Expected: all existing `lib/*.test.ts` pass, with no DB connection attempted.

- [ ] **Step 4: Commit**

```bash
git add test/db/harness.db.test.ts
git commit -m "test: smoke-test DB harness isolation"
```

---

## Task 1.2: Scoped `ensureCards` + group constants

**Files:**
- Create: `lib/groups.ts`, `lib/groups.db.test.ts`
- Modify: `app/review/actions.ts`

- [ ] **Step 1: Write the failing test for scoped `ensureCards`**

Create `lib/groups.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { ensureCards } from "./groups";
import { makeUser, makeProblem } from "@/test/db/factory";

describe("ensureCards(userId, problemIds)", () => {
  it("creates cards only for the given problems", async () => {
    const u = await makeUser();
    const a = await makeProblem("a");
    const b = await makeProblem("b");
    await makeProblem("c"); // not passed → no card

    await ensureCards(u.id, [a.id, b.id]);

    const cards = await prisma.card.findMany({ where: { userId: u.id } });
    expect(cards.map((c) => c.problemId).sort()).toEqual([a.id, b.id].sort());
  });

  it("is idempotent (no duplicate, no throw)", async () => {
    const u = await makeUser();
    const a = await makeProblem("a");
    await ensureCards(u.id, [a.id]);
    await ensureCards(u.id, [a.id]);
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(1);
  });

  it("no-ops on an empty list", async () => {
    const u = await makeUser();
    await ensureCards(u.id, []);
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- lib/groups.db.test.ts`
Expected: FAIL — `Cannot find module './groups'`.

- [ ] **Step 3: Implement `lib/groups.ts`**

Create `lib/groups.ts`:

```ts
import { prisma } from "@/lib/db";

export const SYSTEM_GROUP_KEY = "neetcode-150";

/**
 * Materialize SM-2 cards for a user across exactly the given problems.
 * Idempotent: relies on Card @@unique([userId, problemId]) + skipDuplicates.
 * Replaces the old global ensureCards that created a card for EVERY problem.
 */
export async function ensureCards(userId: string, problemIds: string[]): Promise<void> {
  if (problemIds.length === 0) return;
  await prisma.card.createMany({
    data: problemIds.map((problemId) => ({ userId, problemId })),
    skipDuplicates: true,
  });
}

/** Problem ids attached to the default-active system group (NeetCode 150). */
export async function defaultActivationProblemIds(): Promise<string[]> {
  const group = await prisma.group.findUnique({
    where: { key: SYSTEM_GROUP_KEY },
    select: { problems: { select: { problemId: true } } },
  });
  return group?.problems.map((gp) => gp.problemId) ?? [];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- lib/groups.db.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Point the old `ensureCards` callers at the new module (temporary shim)**

`app/review/actions.ts` currently exports a global `ensureCards(userId)`. Task 2.2 removes its call sites entirely; for now, to avoid breaking imports mid-refactor, delete the old `ensureCards` export from `app/review/actions.ts` and update the two importers (`app/review/page.tsx:5`, `app/today/page.tsx:5`) to import from `@/lib/groups` — but they need *problemIds*. Since Task 2.2 rewrites those pages, leave a TODO and a behavior-preserving bridge: in `app/review/actions.ts`, replace the body of the old function with a call that ensures the default (system-group) problems, so behavior is unchanged until Task 2.2:

Replace the `ensureCards` function in `app/review/actions.ts` (lines ~233-255) with:

```ts
import { ensureCards as ensureCardsFor, defaultActivationProblemIds } from "@/lib/groups";

// TEMPORARY bridge (removed in Plan-1 Task 2.2): preserves "all curated cards exist"
// behavior for the two page loads until they are scoped to active groups.
export async function ensureCards(userId: string): Promise<void> {
  await ensureCardsFor(userId, await defaultActivationProblemIds());
}
```

- [ ] **Step 6: Verify everything still compiles and unit tests pass**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: no type errors; unit tests green.

- [ ] **Step 7: Commit**

```bash
git add lib/groups.ts lib/groups.db.test.ts app/review/actions.ts
git commit -m "feat: scoped ensureCards(userId, problemIds) + system group helpers"
```

---

## Task 1.3: Seed — system group + composite upsert

**Files:**
- Modify: `prisma/seed.ts`
- Create: `prisma/seed.db.test.ts`

- [ ] **Step 1: Write the failing seed test**

Create `prisma/seed.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { seedDatabase } from "./seed";
import { SYSTEM_GROUP_KEY } from "@/lib/groups";

describe("seedDatabase", () => {
  it("creates the NeetCode 150 system group with all curated problems attached", async () => {
    await seedDatabase();
    const group = await prisma.group.findUnique({
      where: { key: SYSTEM_GROUP_KEY },
      include: { problems: true },
    });
    expect(group).not.toBeNull();
    expect(group!.ownerId).toBeNull();
    expect(group!.visibility).toBe("SHARED");
    const problemCount = await prisma.problem.count({ where: { createdById: null } });
    expect(group!.problems.length).toBe(problemCount);
    expect(problemCount).toBeGreaterThan(100);
  });

  it("is idempotent (second run does not duplicate)", async () => {
    await seedDatabase();
    const after1 = await prisma.problem.count();
    await seedDatabase();
    const after2 = await prisma.problem.count();
    expect(after2).toBe(after1);
    expect(await prisma.group.count({ where: { key: SYSTEM_GROUP_KEY } })).toBe(1);
  });

  it("does not delete user-authored problems during stale cleanup", async () => {
    await seedDatabase();
    const u = await prisma.user.create({ data: { email: "seed@test.local", passwordHash: "x" } });
    await prisma.problem.create({
      data: { slug: "my-own", createdById: u.id, title: "Mine", source: "user", prompt: "p", approach: "a", tags: [] },
    });
    await seedDatabase(); // stale cleanup must skip createdById != null
    expect(await prisma.problem.count({ where: { slug: "my-own", createdById: u.id } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- prisma/seed.db.test.ts`
Expected: FAIL — `seed` has no export `seedDatabase`.

- [ ] **Step 3: Refactor `prisma/seed.ts` to an importable `seedDatabase()`**

Replace `prisma/seed.ts` with:

```ts
import { PrismaClient } from "@prisma/client";
import { SEED_PROBLEMS } from "../lib/seed-data";
import { SYSTEM_GROUP_KEY } from "../lib/groups";

const prisma = new PrismaClient();

export async function seedDatabase() {
  // 1. Upsert curated problems by the composite unique (createdById=null, slug).
  for (const p of SEED_PROBLEMS) {
    await prisma.problem.upsert({
      where: { createdById_slug: { createdById: null, slug: p.slug } },
      update: { title: p.title, source: p.source, url: p.url, prompt: p.prompt, approach: p.approach, tags: p.tags },
      create: { ...p, createdById: null },
    });
  }

  // 2. Stale-delete curated problems only — never touch user-authored ones.
  const keepSlugs = SEED_PROBLEMS.map((p) => p.slug);
  const removed = await prisma.problem.deleteMany({
    where: { createdById: null, slug: { notIn: keepSlugs } },
  });
  if (removed.count > 0) console.log(`Removed ${removed.count} stale curated problems`);

  // 3. Upsert the system group by key.
  const group = await prisma.group.upsert({
    where: { key: SYSTEM_GROUP_KEY },
    update: { name: "NeetCode 150", visibility: "SHARED", ownerId: null },
    create: { key: SYSTEM_GROUP_KEY, name: "NeetCode 150", visibility: "SHARED", ownerId: null },
  });

  // 4. Attach every curated problem to the group (idempotent).
  const curated = await prisma.problem.findMany({ where: { createdById: null }, select: { id: true } });
  await prisma.groupProblem.createMany({
    data: curated.map((p) => ({ groupId: group.id, problemId: p.id })),
    skipDuplicates: true,
  });

  // 5. Re-ensure cards for everyone already activated on the system group,
  //    so problems added after their activation still materialize.
  const activations = await prisma.groupActivation.findMany({
    where: { groupId: group.id },
    select: { userId: true },
  });
  if (activations.length > 0) {
    const problemIds = curated.map((p) => p.id);
    for (const { userId } of activations) {
      await prisma.card.createMany({
        data: problemIds.map((problemId) => ({ userId, problemId })),
        skipDuplicates: true,
      });
    }
  }

  const count = await prisma.problem.count();
  console.log(`Seeded. Problem count = ${count}`);
  return group;
}

// CLI entrypoint (npm run db:seed).
if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

> The test imports `seedDatabase` and uses the shared `@/lib/db` prisma client; the CLI block uses its own client and only runs under `tsx prisma/seed.ts`. The two clients hit the same DB; that is fine.

- [ ] **Step 4: Run the seed tests to verify they pass**

Run: `npm run test:db -- prisma/seed.db.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Verify the CLI seed still runs against dev DB**

Run: `npm run db:seed`
Expected: "Seeded. Problem count = 150" (or current curated count) and no error.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts prisma/seed.db.test.ts
git commit -m "feat(seed): NeetCode 150 system group + composite-unique upsert + curated-scoped cleanup"
```

---

## Task 1.4: Backfill existing users

**Files:**
- Create: `prisma/backfill-groups.ts`, `prisma/backfill-groups.db.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing backfill test**

Create `prisma/backfill-groups.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { seedDatabase } from "./seed";
import { backfillGroups } from "./backfill-groups";
import { SYSTEM_GROUP_KEY } from "@/lib/groups";

async function existingUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "x", groupsInitialized: false } });
}

describe("backfillGroups", () => {
  it("activates the system group, materializes cards, and flips the flag", async () => {
    const group = await seedDatabase();
    const u = await existingUser("old@test.local");

    await backfillGroups();

    expect(await prisma.groupActivation.count({ where: { userId: u.id, groupId: group.id } })).toBe(1);
    const curated = await prisma.problem.count({ where: { createdById: null } });
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(curated);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after!.groupsInitialized).toBe(true);
  });

  it("is idempotent and asserts card counts", async () => {
    await seedDatabase();
    await existingUser("old2@test.local");
    await backfillGroups();
    const report = await backfillGroups();
    expect(report.usersMissingCards).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- prisma/backfill-groups.db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill**

Create `prisma/backfill-groups.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { SYSTEM_GROUP_KEY } from "../lib/groups";

const prisma = new PrismaClient();

export async function backfillGroups() {
  const group = await prisma.group.findUnique({
    where: { key: SYSTEM_GROUP_KEY },
    select: { id: true, problems: { select: { problemId: true } } },
  });
  if (!group) throw new Error("System group not seeded — run db:seed first");
  const problemIds = group.problems.map((p) => p.problemId);

  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id: userId } of users) {
    await prisma.groupActivation.createMany({
      data: [{ userId, groupId: group.id }],
      skipDuplicates: true,
    });
    await prisma.card.createMany({
      data: problemIds.map((problemId) => ({ userId, problemId })),
      skipDuplicates: true,
    });
    await prisma.user.update({ where: { id: userId }, data: { groupsInitialized: true } });
  }

  // Deploy checklist assertion: every user has every system-group card.
  let usersMissingCards = 0;
  for (const { id: userId } of users) {
    const have = await prisma.card.count({ where: { userId, problemId: { in: problemIds } } });
    if (have < problemIds.length) usersMissingCards += 1;
  }
  const report = { users: users.length, problems: problemIds.length, usersMissingCards };
  console.log("Backfill report:", report);
  return report;
}

if (require.main === module) {
  backfillGroups()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

Add to `package.json` scripts:

```json
"db:backfill-groups": "tsx prisma/backfill-groups.ts"
```

- [ ] **Step 4: Run the backfill tests to verify they pass**

Run: `npm run test:db -- prisma/backfill-groups.db.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add prisma/backfill-groups.ts prisma/backfill-groups.db.test.ts package.json
git commit -m "feat: one-shot group backfill for existing users with card-count assertion"
```

---

## Task 1.5: Transactional default activation at signup

**Files:**
- Modify: `app/signup/actions.ts`
- Create: `app/signup/actions.db.test.ts`

- [ ] **Step 1: Write the failing test for the signup helper**

We test the DB effect in isolation via an extracted helper (the full `signupAction` calls `signIn`, which throws `NEXT_REDIRECT` and is not unit-testable). Create `app/signup/actions.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { seedDatabase } from "@/prisma/seed";
import { createUserWithDefaultGroup } from "./actions";
import { SYSTEM_GROUP_KEY } from "@/lib/groups";

describe("createUserWithDefaultGroup", () => {
  it("creates user + activation + all cards + sets the flag", async () => {
    await seedDatabase();
    const u = await createUserWithDefaultGroup("new@test.local", "hash");
    const group = await prisma.group.findUnique({ where: { key: SYSTEM_GROUP_KEY } });
    const curated = await prisma.problem.count({ where: { createdById: null } });

    expect(await prisma.groupActivation.count({ where: { userId: u.id, groupId: group!.id } })).toBe(1);
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(curated);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))!.groupsInitialized).toBe(true);
  });

  it("tolerates a missing system group (no 500, flag stays false)", async () => {
    // No seedDatabase() → no system group.
    const u = await createUserWithDefaultGroup("nogroup@test.local", "hash");
    expect(await prisma.groupActivation.count({ where: { userId: u.id } })).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))!.groupsInitialized).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- app/signup/actions.db.test.ts`
Expected: FAIL — `actions` has no export `createUserWithDefaultGroup`.

- [ ] **Step 3: Extract the transactional helper and call it from `signupAction`**

In `app/signup/actions.ts`, add the imports and the exported helper, and replace the `prisma.user.create` block. Add near the top imports:

```ts
import { SYSTEM_GROUP_KEY } from "@/lib/groups";
```

Add this exported function (above `signupAction`):

```ts
/**
 * Create the user and, if the system group exists, activate it + materialize its
 * cards + set groupsInitialized — all in one transaction. signIn is NOT called here
 * (it re-queries the DB and throws NEXT_REDIRECT; it cannot live in a transaction).
 * A missing system group is tolerated: the user is created with the flag false, and
 * the activeCardWhere fallback (Task 2.1) yields the curated pile.
 */
export async function createUserWithDefaultGroup(email: string, passwordHash: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash } });
    const group = await tx.group.findUnique({
      where: { key: SYSTEM_GROUP_KEY },
      select: { id: true, problems: { select: { problemId: true } } },
    });
    if (group) {
      await tx.groupActivation.create({ data: { userId: user.id, groupId: group.id } });
      await tx.card.createMany({
        data: group.problems.map((p) => ({ userId: user.id, problemId: p.problemId })),
        skipDuplicates: true,
      });
      await tx.user.update({ where: { id: user.id }, data: { groupsInitialized: true } });
    }
    return user;
  });
}
```

Then change the `try` block in `signupAction` from:

```ts
  try {
    await prisma.user.create({ data: { email, passwordHash } });
  } catch (err) {
```

to:

```ts
  try {
    await createUserWithDefaultGroup(email, passwordHash);
  } catch (err) {
```

(The existing `P2002` catch and the subsequent `signIn(..., { redirectTo: "/review" })` stay exactly as they are — `signIn` runs after the transaction commits.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- app/signup/actions.db.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Verify compile + unit tests**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/signup/actions.ts app/signup/actions.db.test.ts
git commit -m "feat(signup): transactional default group activation before sign-in"
```

---

## Task 2.1: `activeCardWhere` fragment + fallback

**Files:**
- Create: `lib/active-cards.ts`, `lib/active-cards.db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/active-cards.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { activeCardWhere, hasAnyActiveCard } from "./active-cards";

async function cardFor(userId: string, problemId: string) {
  await prisma.card.create({ data: { userId, problemId } });
}

describe("activeCardWhere", () => {
  it("returns only cards whose problem is in an ACTIVE group", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const inGroup = await makeProblem("in");
    const notInGroup = await makeProblem("out");
    await cardFor(u.id, inGroup.id);
    await cardFor(u.id, notInGroup.id);

    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: inGroup.id } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });

    const cards = await prisma.card.findMany({ where: activeCardWhere(u.id, true) });
    expect(cards.map((c) => c.problemId)).toEqual([inGroup.id]);
  });

  it("never leaks another user's or a non-activated group's cards", async () => {
    const a = await makeUser({ groupsInitialized: true });
    const b = await makeUser({ groupsInitialized: true });
    const p = await makeProblem("shared");
    await cardFor(a.id, p.id);
    await cardFor(b.id, p.id);
    const g = await prisma.group.create({ data: { ownerId: b.id, visibility: "PRIVATE", name: "B" } });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.groupActivation.create({ data: { userId: b.id, groupId: g.id } });

    // A has no activation → A sees nothing; the query is scoped to A.
    expect(await prisma.card.findMany({ where: activeCardWhere(a.id, true) })).toHaveLength(0);
  });

  it("falls back to all curated cards when groupsInitialized is false", async () => {
    const u = await makeUser({ groupsInitialized: false });
    const curated = await makeProblem("curated", null);
    const authored = await makeProblem("authored", u.id);
    await cardFor(u.id, curated.id);
    await cardFor(u.id, authored.id);

    const cards = await prisma.card.findMany({ where: activeCardWhere(u.id, false) });
    expect(cards.map((c) => c.problemId)).toEqual([curated.id]);
  });

  it("initialized user with zero active groups sees nothing (not the fallback)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const curated = await makeProblem("c", null);
    await cardFor(u.id, curated.id);
    expect(await hasAnyActiveCard(u.id, true)).toBe(false);
    expect(await prisma.card.findMany({ where: activeCardWhere(u.id, true) })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- lib/active-cards.db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/active-cards.ts`**

Create `lib/active-cards.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The single source of truth for "which of a user's cards are studyable today".
 * Server-only; derived purely from the authenticated userId. Never accepts a client groupId.
 *
 * groupsInitialized === false → fallback to all curated content (createdById: null),
 * reproducing pre-feature behavior for un-backfilled users. Once initialized, an empty
 * active set correctly yields an empty pile.
 */
export function activeCardWhere(userId: string, groupsInitialized: boolean): Prisma.CardWhereInput {
  if (!groupsInitialized) {
    return { userId, problem: { createdById: null } };
  }
  return {
    userId,
    problem: {
      groups: {
        some: {
          group: {
            activations: { some: { userId } },
            OR: [{ visibility: "SHARED" }, { ownerId: userId }],
          },
        },
      },
    },
  };
}

/** Does the user have at least one studyable card under the effective active set? */
export async function hasAnyActiveCard(userId: string, groupsInitialized: boolean): Promise<boolean> {
  const found = await prisma.card.findFirst({
    where: activeCardWhere(userId, groupsInitialized),
    select: { id: true },
  });
  return found !== null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- lib/active-cards.db.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/active-cards.ts lib/active-cards.db.test.ts
git commit -m "feat: activeCardWhere scoping fragment + groupsInitialized fallback"
```

---

## Task 2.2: Scope the review queue + today counts; remove global ensure

**Files:**
- Modify: `app/review/page.tsx`, `app/today/page.tsx`, `app/review/actions.ts`
- Create: `app/review/queue.db.test.ts`

- [ ] **Step 1: Write the failing integration test for queue scoping**

Create `app/review/queue.db.test.ts` (tests the query shape used by the page, via `activeCardWhere`):

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { activeCardWhere } from "@/lib/active-cards";

const PAST = new Date("2020-01-01T00:00:00Z");

describe("review queue scoping", () => {
  it("a due card NOT in an active group is excluded", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const p = await makeProblem("orphan");
    await prisma.card.create({ data: { userId: u.id, problemId: p.id, dueAt: PAST } });

    const due = await prisma.card.findFirst({
      where: { ...activeCardWhere(u.id, true), dueAt: { lte: new Date() } },
    });
    expect(due).toBeNull(); // card exists & is due, but no active group holds it
  });

  it("a due card in an active group is included", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const p = await makeProblem("studied");
    await prisma.card.create({ data: { userId: u.id, problemId: p.id, dueAt: PAST } });
    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });

    const due = await prisma.card.findFirst({
      where: { ...activeCardWhere(u.id, true), dueAt: { lte: new Date() } },
    });
    expect(due?.problemId).toBe(p.id);
  });
});
```

- [ ] **Step 2: Run it to verify it passes against the fragment, then proceed to wire pages**

Run: `npm run test:db -- app/review/queue.db.test.ts`
Expected: PASS (this validates the fragment behavior the pages will adopt). It documents the contract the page edits must preserve.

- [ ] **Step 3: Add a scoped self-heal helper to `lib/groups.ts`**

Append to `lib/groups.ts`:

```ts
import { activeCardWhere } from "@/lib/active-cards";

/**
 * Ensure cards exist for every active-group problem the user is missing.
 * Cheap + idempotent; covers new curated problems seeded after activation and
 * any half-succeeded backfill. Only runs the create when there's a gap.
 */
export async function selfHealActiveCards(userId: string, groupsInitialized: boolean): Promise<void> {
  if (!groupsInitialized) return; // fallback users already see all curated cards
  const activeProblems = await prisma.problem.findMany({
    where: {
      groups: {
        some: {
          group: { activations: { some: { userId } }, OR: [{ visibility: "SHARED" }, { ownerId: userId }] },
        },
      },
      cards: { none: { userId } },
    },
    select: { id: true },
  });
  if (activeProblems.length === 0) return;
  await ensureCards(userId, activeProblems.map((p) => p.id));
}
```

- [ ] **Step 4: Rewrite `app/review/page.tsx` to scope the queue**

In `app/review/page.tsx`: remove the `import { ensureCards } from "./actions";` line and the `await ensureCards(userId);` call. Add imports and load the flag + self-heal, then scope both branches and the count.

Replace the import line:
```ts
import { ensureCards } from "./actions";
```
with:
```ts
import { activeCardWhere } from "@/lib/active-cards";
import { selfHealActiveCards } from "@/lib/groups";
```

Replace `await ensureCards(userId);` with:
```ts
const user = await prisma.user.findUnique({ where: { id: userId }, select: { groupsInitialized: true } });
const gi = user?.groupsInitialized ?? false;
await selfHealActiveCards(userId, gi);
const scope = activeCardWhere(userId, gi);
```

In the `ahead > 0` branch, change the `where` from:
```ts
      where: {
        userId,
        dueAt: { gt: now, lte: threeDaysAhead },
        id: { notIn: skipped },
      },
```
to:
```ts
      where: {
        ...scope,
        dueAt: { gt: now, lte: threeDaysAhead },
        id: { notIn: skipped },
      },
```

In the `else` branch, change:
```ts
      where: { userId, dueAt: { lte: now }, id: { notIn: skipped } },
```
to:
```ts
      where: { ...scope, dueAt: { lte: now }, id: { notIn: skipped } },
```

And change the count:
```ts
  const dueCount = await prisma.card.count({ where: { userId, dueAt: { lte: now } } });
```
to:
```ts
  const dueCount = await prisma.card.count({ where: { ...scope, dueAt: { lte: now } } });
```

- [ ] **Step 5: Rewrite `app/today/page.tsx` counts to use the scope**

In `app/today/page.tsx`: remove `import { ensureCards } from "@/app/review/actions";` and `await ensureCards(userId);`. The `user` object is already loaded (`prisma.user.findUnique`), so reuse `user.groupsInitialized`.

Replace the import:
```ts
import { ensureCards } from "@/app/review/actions";
```
with:
```ts
import { activeCardWhere } from "@/lib/active-cards";
import { selfHealActiveCards } from "@/lib/groups";
```

Replace `await ensureCards(userId);` (line ~25) with:
```ts
  const gi = user.groupsInitialized;
  await selfHealActiveCards(userId, gi);
  const scope = activeCardWhere(userId, gi);
```

Scope the three count/find queries — change each `where: { userId, ... }` to `where: { ...scope, ... }`:
```ts
  const dueRowsCount = await prisma.card.count({ where: { ...scope, dueAt: { lte: now } } });
  // ...
  const dueSoonCount = await prisma.card.count({
    where: { ...scope, dueAt: { gt: now, lte: threeDaysAhead } },
  });
  // ...
  const nextDue = await prisma.card.findFirst({
    where: { ...scope, dueAt: { gt: now } },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });
```

Leave `hasAnyCards` as the existing global `card.count({ where: { userId } })` — it only chooses copy (brand-new vs deactivated-everything), not the empty-queue trigger (handled in Task 2.3).

- [ ] **Step 6: Remove the temporary `ensureCards` bridge from `app/review/actions.ts`**

Delete the `ensureCards` bridge function added in Task 1.2 Step 5 and its two imports (`ensureCardsFor`, `defaultActivationProblemIds`) from `app/review/actions.ts` — nothing imports it anymore (Steps 4–5 removed both call sites).

- [ ] **Step 7: Verify compile, unit, and DB tests**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:db`
Expected: no type errors (no dangling `ensureCards` import); all green.

- [ ] **Step 8: Manual parity check against dev DB**

With a seeded dev DB and a backfilled user (`npm run db:seed && npm run db:backfill-groups`), load `/today` and `/review`. Expected: due counts and the review queue are identical to pre-change (the default activation makes the scope a no-op over curated cards).

- [ ] **Step 9: Commit**

```bash
git add app/review/page.tsx app/today/page.tsx app/review/actions.ts lib/groups.ts app/review/queue.db.test.ts
git commit -m "feat: scope review queue + today counts to active groups; self-heal; drop global ensureCards"
```

---

## Task 2.3: Zero-active done-state

**Files:**
- Modify: `lib/done-copy.ts`, `lib/done-copy.test.ts`, `app/today/page.tsx`

- [ ] **Step 1: Read the current done-copy contract**

Open `lib/done-copy.ts` and `lib/done-copy.test.ts` to see the `selectDoneState` input shape and existing variants (referenced as A–E in the spec). The new variant triggers when the user is initialized but has no active-set card.

- [ ] **Step 2: Write the failing test for the zero-active variant**

Add to `lib/done-copy.test.ts`:

```ts
import { selectDoneState } from "./done-copy";

describe("zero-active group state", () => {
  it("shows the activate-a-group copy when initialized with no active cards", () => {
    const state = selectDoneState({
      hasAnyCards: true,        // user has history
      hasAnyActiveCard: false,  // but nothing active
      excessDueToday: 0,
      dueSoonCount: 0,
      nextDueAt: null,
      now: new Date("2026-06-04T12:00:00Z"),
    });
    expect(state.copy).toMatch(/no active group/i);
    expect(state.showGroupsCta).toBe(true);
  });

  it("does not show the groups CTA when there are active cards due soon", () => {
    const state = selectDoneState({
      hasAnyCards: true,
      hasAnyActiveCard: true,
      excessDueToday: 0,
      dueSoonCount: 3,
      nextDueAt: new Date("2026-06-05T12:00:00Z"),
      now: new Date("2026-06-04T12:00:00Z"),
    });
    expect(state.showGroupsCta).toBeFalsy();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:unit -- lib/done-copy.test.ts`
Expected: FAIL — `selectDoneState` does not accept `hasAnyActiveCard` / returns no `showGroupsCta`.

- [ ] **Step 4: Extend `selectDoneState` in `lib/done-copy.ts`**

Add `hasAnyActiveCard: boolean` to the input type. Add `showGroupsCta?: boolean` to the returned state type. As the FIRST branch in the selection logic (highest priority), add:

```ts
  if (input.hasAnyCards && !input.hasAnyActiveCard) {
    return {
      copy: "No active groups. Activate one to start studying.",
      showGroupsCta: true,
      showDueSoonCta: false,
    };
  }
```

(Keep all existing branches below it. If the return type uses a discriminated shape, add `showGroupsCta`/`showDueSoonCta` consistently to existing returns so the type stays uniform.)

- [ ] **Step 5: Run the done-copy tests to verify they pass**

Run: `npm run test:unit -- lib/done-copy.test.ts`
Expected: all green (new + existing).

- [ ] **Step 6: Wire it into `app/today/page.tsx`**

Compute `hasAnyActiveCard` and pass it to `DoneState`. After the `scope` is defined (Task 2.2), add:

```ts
import { hasAnyActiveCard } from "@/lib/active-cards";
// ...
  const anyActive = await hasAnyActiveCard(userId, gi);
```

Pass `hasAnyActiveCard={anyActive}` into the `<DoneState ... />` element, thread it through `DoneState`'s props into the `selectDoneState({ ... })` call, and render a Groups CTA when `state.showGroupsCta`:

```tsx
      {state.showGroupsCta && (
        <Link
          href="/groups"
          className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-lg border border-border-hi bg-surface-2 px-6 font-medium text-fg hover:border-accent hover:text-accent transition-colors"
        >
          Manage groups →
        </Link>
      )}
```

> `/groups` does not exist until Plan 2. The link is harmless (404 until then) and the zero-active state only appears if a user manually deactivates everything, which is impossible until the groups UI ships. Acceptable for this slice.

- [ ] **Step 7: Verify compile + all tests**

Run: `npx tsc --noEmit && npm run test:unit && npm run test:db`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/done-copy.ts lib/done-copy.test.ts app/today/page.tsx
git commit -m "feat(today): zero-active-groups done-state driven by effective active set"
```

---

## Task 2.4: Performance acceptance gate

**Files:**
- Create: `docs/superpowers/notes/2026-06-04-active-card-where-explain.md`

- [ ] **Step 1: Capture the query plan for the hottest path**

With a seeded + backfilled dev DB (150 cards, one user activated on the system group), run `EXPLAIN ANALYZE` for the today `dueRowsCount`. Use `npx prisma db execute` or `psql`:

```sql
EXPLAIN ANALYZE
SELECT count(*) FROM "Card" c
WHERE c."userId" = '<USER_ID>'
  AND c."dueAt" <= now()
  AND EXISTS (
    SELECT 1 FROM "GroupProblem" gp
    JOIN "Group" g ON g.id = gp."groupId"
    JOIN "GroupActivation" ga ON ga."groupId" = g.id AND ga."userId" = c."userId"
    WHERE gp."problemId" = c."problemId"
      AND (g.visibility = 'SHARED' OR g."ownerId" = c."userId")
  );
```

- [ ] **Step 2: Assert the plan and record it**

Acceptance: the plan drives on the `Card_userId_dueAt_idx` index (Index Scan / Bitmap, **no Seq Scan on `Card`**), with the membership check as a correlated semi-join. Record the plan + timing in `docs/superpowers/notes/2026-06-04-active-card-where-explain.md`, including the row counts and the observed time.

If a Seq Scan on `Card` appears, the documented fallback is: materialize the active problem-id set per request and pass `problemId: { in: [...] }`, or add a denormalized membership table. Note which path was taken (none expected at 150 cards).

- [ ] **Step 3: Commit the note**

```bash
git add docs/superpowers/notes/2026-06-04-active-card-where-explain.md
git commit -m "docs: record activeCardWhere query plan + perf acceptance"
```

---

## Self-review checklist (completed during authoring)

- **Spec coverage (Steps 0–2):** test infra (T0.1/0.2) ✓; schema + ownership + slug scheme (T1.1) ✓; scoped ensureCards (T1.2) ✓; seed system group + composite upsert + curated-scoped cleanup + re-ensure (T1.3) ✓; backfill with card-count assertion (T1.4) ✓; transactional signup + missing-group tolerance (T1.5) ✓; `activeCardWhere` + fallback + real call-sites (review `findFirst`×2 + `dueCount`, today counts) + self-heal + remove both global ensures + `gradeCard` left unchanged (T2.1/2.2) ✓; effective-active-set done-state (T2.3) ✓; perf gate (T2.4) ✓.
- **Deferred to Plan 2/3 (intentionally absent here):** all `app/groups/actions.ts` server actions, ownership-guard helpers, `/groups` UI, Duplicate/deep-copy, focus session, orphaned-card list UI. `gradeCard` stays unchanged in this slice (spec §2).
- **Type consistency:** `ensureCards(userId, problemIds)`, `activeCardWhere(userId, groupsInitialized)`, `hasAnyActiveCard(userId, groupsInitialized)`, `selfHealActiveCards(userId, groupsInitialized)`, `seedDatabase()`, `backfillGroups()`, `createUserWithDefaultGroup(email, passwordHash)`, `SYSTEM_GROUP_KEY` — names/signatures match across all tasks. `selectDoneState` gains `hasAnyActiveCard` input + `showGroupsCta` output, used consistently in T2.3.
- **Ordering note:** `test/db/factory.ts` (T0.1) references `groupsInitialized`/`createdById` added in T1.1; the harness smoke test (T0.2) is deliberately ordered after T1.1.

## Implementation corrections (applied during execution, verified by CI)

Deltas from the plan-as-written, each caught by the CI pipeline (typecheck + Postgres tests):

1. **Vitest `@/` alias (T0.1).** vitest doesn't read tsconfig `paths`, so DB tests couldn't import `@/lib/db`. Added a regex alias `^@\/(.*)$ → <root>/$1` to `vitest.config.ts`, applied **per-project** (root `resolve` isn't inherited by `test.projects`).
2. **Seed upsert (T1.3).** `where: { createdById_slug: { createdById: null, slug } }` does not type-check — Prisma compound-unique selectors reject a NULL component. Replaced with `findFirst({ where: { createdById: null, slug } })` → `update`/`create`. Spec §4 updated to match.
3. **`createUserWithDefaultGroup` location (T1.5).** Importing `app/signup/actions.ts` in a test pulls in `next-auth` → `next/server`, which fails under vitest's node loader. Moved the pure-Prisma helper into `lib/groups.ts` (testable); `actions.ts` imports it. Test lives in `lib/groups.db.test.ts`.
4. **CI as the runner (environment).** No local Node/Postgres on the dev machine, so verification runs in GitHub Actions (`.github/workflows/test.yml`: Postgres 16 service + typecheck + unit + db). Added a `tsc --noEmit` gate that caught #2.
5. **T2.4 perf gate** is **documented, not CI-asserted** — CI's tiny synthetic dataset makes Postgres correctly seq-scan small tables, so a scan-type assertion there is a false signal. Live `EXPLAIN ANALYZE` is captured against the seeded Railway DB post-deploy (see `docs/superpowers/notes/2026-06-04-active-card-where-explain.md`).

