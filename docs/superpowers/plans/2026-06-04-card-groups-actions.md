# Card Groups — Plan 2 of 3: Group Actions & Ownership Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete, secure server-action *logic* for card groups — create/rename/delete/activate/deactivate groups, add/remove/author/edit problems — as pure `userId`-scoped functions with ownership guards and adversarial IDOR test coverage.

**Architecture:** All mutation logic lives in `lib/group-actions.ts` as plain async functions that take an explicit `userId` (never read a session). This keeps them out of the `next-auth`-importing `"use server"` files (which crash vitest's node loader — proven in Plan 1) so they're fully DB-testable. Ownership is enforced by `assertOwnedGroup` / `assertOwnedProblem` / `assertStudyableGroup` guards that throw a typed `GroupError`. The thin `"use server"` wrappers (`auth()` + `rateLimit()` + delegate) ship in Plan 3 with the UI that calls them.

**Tech Stack:** TypeScript, Prisma 6 + PostgreSQL, vitest 4 (DB project), verified in GitHub Actions CI (no local toolchain).

**Spec:** `docs/superpowers/specs/2026-06-04-card-groups-design.md` — this plan implements the **§3 "Per-action authorization" table** and the Data-model authorization rules, EXCEPT `duplicateGroup` and the `studyGroup` focus query (Plan 3, with the UI). `gradeCard` stays unchanged (Plan 1).

**Verification:** This machine has no Node/Postgres. Each task's tests run in CI on push (`.github/workflows/test.yml`). The "run the test" steps below mean **push and read the CI result via `gh`**, not local execution.

---

## Background the implementer needs

Already shipped (on `main`) and CI-green:
- Schema: `Group { id, key?, ownerId?, visibility (enum PRIVATE|SHARED), name, description?, sourceGroupId?, problems GroupProblem[], activations GroupActivation[] }`, `GroupProblem { groupId, problemId, @@id([groupId,problemId]) }`, `GroupActivation { userId, groupId, @@id([userId,groupId]) }`, `Problem { createdById?, slug, @@unique([createdById, slug]) ... }`, `Card { userId, problemId, @@unique([userId, problemId]) }`, `User { groupsInitialized }`.
- `lib/groups.ts` exports `ensureCards(userId, problemIds)` (idempotent `createMany({skipDuplicates})`), `SYSTEM_GROUP_KEY`, `createUserWithDefaultGroup`, `selfHealActiveCards`.
- DB tests: `*.db.test.ts`, import `prisma` from `@/lib/db` and `makeUser({groupsInitialized?})` / `makeProblem(slug, createdById=null)` from `@/test/db/factory`. Truncate between tests; run serially. `@/` alias is configured per-project in `vitest.config.ts`.

Authorization rules from the spec (the contract this plan enforces):
- **Editable iff `problem.createdById === userId`** (and thus non-null). Curated problems (`createdById = null`) are read-only.
- **Activate** requires `group.visibility === "SHARED" || group.ownerId === userId` (never existence alone — closes IDOR).
- **Own** = `group.ownerId === userId`. System groups (`ownerId = null`) never match an ownership check.
- **`addProblemToGroup`** must hard-REJECT a problem unless `createdById === null || createdById === userId`.
- New authored problems get `createdById = userId` and an **opaque random slug** (`crypto.randomUUID()`), never derived from title/userId.

---

## File structure

- **Create `lib/group-actions.ts`** — the whole secure mutation surface: `GroupError`, guards (`assertOwnedGroup`, `assertOwnedProblem`, `assertStudyableGroup`), helpers (`isGroupActive`, `groupProblemIds`), and actions (`createGroup`, `renameGroup`, `deleteGroup`, `activateGroup`, `deactivateGroup`, `addProblemToGroup`, `removeProblemFromGroup`, `createProblemInGroup`, `editProblem`). One responsibility: group/problem mutations with ownership enforcement. ~220 lines — acceptable for one cohesive module; if it grows past that, a future split of the guards into `lib/group-access.ts` is reasonable, but keep it together for now.
- **Create `lib/group-actions.db.test.ts`** — the adversarial test suite (happy paths + IDOR negatives + caps).

No `"use server"` files, no UI, no schema changes in this plan.

---

## Task 1: Errors, guards, and helpers

**Files:**
- Create: `lib/group-actions.ts`
- Create: `lib/group-actions.db.test.ts`

- [ ] **Step 1: Write the failing guard tests**

Create `lib/group-actions.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import {
  GroupError,
  assertOwnedGroup,
  assertOwnedProblem,
  assertStudyableGroup,
  isGroupActive,
} from "./group-actions";

async function ownedGroup(userId: string, name = "G") {
  return prisma.group.create({ data: { ownerId: userId, visibility: "PRIVATE", name } });
}

describe("assertOwnedGroup", () => {
  it("returns the group when the caller owns it", async () => {
    const u = await makeUser();
    const g = await ownedGroup(u.id);
    const got = await assertOwnedGroup(u.id, g.id);
    expect(got.id).toBe(g.id);
  });

  it("throws forbidden for another user's group", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await ownedGroup(a.id);
    await expect(assertOwnedGroup(b.id, g.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("throws not_found for a missing group", async () => {
    const u = await makeUser();
    await expect(assertOwnedGroup(u.id, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws forbidden for a system group (ownerId null)", async () => {
    const u = await makeUser();
    const sys = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Sys" } });
    await expect(assertOwnedGroup(u.id, sys.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("assertOwnedProblem", () => {
  it("returns the problem when the caller authored it", async () => {
    const u = await makeUser();
    const p = await makeProblem("mine", u.id);
    expect((await assertOwnedProblem(u.id, p.id)).id).toBe(p.id);
  });

  it("throws forbidden for a curated problem (createdById null)", async () => {
    const u = await makeUser();
    const p = await makeProblem("curated", null);
    await expect(assertOwnedProblem(u.id, p.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("throws forbidden for another user's authored problem", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const p = await makeProblem("theirs", a.id);
    await expect(assertOwnedProblem(b.id, p.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("assertStudyableGroup", () => {
  it("allows a SHARED group the caller does not own", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: a.id, visibility: "SHARED", name: "Shared" } });
    expect((await assertStudyableGroup(b.id, g.id)).id).toBe(g.id);
  });

  it("allows a PRIVATE group the caller owns", async () => {
    const u = await makeUser();
    const g = await ownedGroup(u.id);
    expect((await assertStudyableGroup(u.id, g.id)).id).toBe(g.id);
  });

  it("throws forbidden for another user's PRIVATE group (IDOR guard)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await ownedGroup(a.id);
    await expect(assertStudyableGroup(b.id, g.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("isGroupActive", () => {
  it("reflects activation state for the user", async () => {
    const u = await makeUser();
    const g = await ownedGroup(u.id);
    expect(await isGroupActive(u.id, g.id)).toBe(false);
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });
    expect(await isGroupActive(u.id, g.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Push and confirm the suite fails to import**

Run: `git add -A && git commit -m "test: group-actions guards (failing)" && git push` then read CI.
Expected: the `db` project FAILS — `group-actions.db.test.ts` can't resolve `./group-actions` (module not created yet). (This intermediate red is expected; the next step makes it green.)

- [ ] **Step 3: Implement the errors, guards, and helpers**

Create `lib/group-actions.ts`:

```ts
import type { Group, Problem } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Typed failure for group/problem authorization + invariants. Action wrappers map `code` to HTTP/redirect. */
export class GroupError extends Error {
  constructor(
    public code: "forbidden" | "not_found" | "invalid_problem" | "cap_exceeded",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GroupError";
  }
}

/** The group must exist AND be owned by the caller. System groups (ownerId null) never match. */
export async function assertOwnedGroup(userId: string, groupId: string): Promise<Group> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError("not_found");
  if (group.ownerId !== userId) throw new GroupError("forbidden");
  return group;
}

/** The problem must exist AND be authored by the caller. Curated (createdById null) is read-only. */
export async function assertOwnedProblem(userId: string, problemId: string): Promise<Problem> {
  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) throw new GroupError("not_found");
  if (problem.createdById === null || problem.createdById !== userId) throw new GroupError("forbidden");
  return problem;
}

/** The group must exist AND be studyable by the caller: SHARED, or owned by the caller. */
export async function assertStudyableGroup(userId: string, groupId: string): Promise<Group> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError("not_found");
  if (group.visibility !== "SHARED" && group.ownerId !== userId) throw new GroupError("forbidden");
  return group;
}

/** Is this group currently in the user's active set? */
export async function isGroupActive(userId: string, groupId: string): Promise<boolean> {
  const row = await prisma.groupActivation.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  return row !== null;
}

/** Problem ids attached to a group. */
export async function groupProblemIds(groupId: string): Promise<string[]> {
  const rows = await prisma.groupProblem.findMany({ where: { groupId }, select: { problemId: true } });
  return rows.map((r) => r.problemId);
}
```

- [ ] **Step 4: Push and confirm the guard tests pass**

Run: `git add -A && git commit -m "feat: group-actions errors, ownership guards, helpers" && git push` then read CI.
Expected: `db` project PASSES the `assertOwnedGroup` / `assertOwnedProblem` / `assertStudyableGroup` / `isGroupActive` suites (the action suites don't exist yet).

---

## Task 2: createGroup / renameGroup / deleteGroup (+ group cap)

**Files:**
- Modify: `lib/group-actions.ts`
- Modify: `lib/group-actions.db.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `lib/group-actions.db.test.ts`:

```ts
import {
  MAX_GROUPS_PER_USER,
  createGroup,
  renameGroup,
  deleteGroup,
} from "./group-actions";

describe("createGroup", () => {
  it("creates a PRIVATE group owned by the caller", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "Graphs", "my graph set");
    expect(g.ownerId).toBe(u.id);
    expect(g.visibility).toBe("PRIVATE");
    expect(g.name).toBe("Graphs");
    expect(g.description).toBe("my graph set");
    expect(g.key).toBeNull();
  });

  it("rejects a blank name", async () => {
    const u = await makeUser();
    await expect(createGroup(u.id, "   ")).rejects.toMatchObject({ code: "invalid_problem" });
  });

  it("enforces the per-user group cap", async () => {
    const u = await makeUser();
    await prisma.group.createMany({
      data: Array.from({ length: MAX_GROUPS_PER_USER }, (_, i) => ({
        ownerId: u.id,
        visibility: "PRIVATE" as const,
        name: `g${i}`,
      })),
    });
    await expect(createGroup(u.id, "one too many")).rejects.toMatchObject({ code: "cap_exceeded" });
  });
});

describe("renameGroup", () => {
  it("updates name/description for an owned group", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "Old");
    const updated = await renameGroup(u.id, g.id, { name: "New", description: "d" });
    expect(updated.name).toBe("New");
    expect(updated.description).toBe("d");
  });

  it("refuses to rename another user's group", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(a.id, "A");
    await expect(renameGroup(b.id, g.id, { name: "hax" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("deleteGroup", () => {
  it("deletes an owned group and its memberships but keeps cards", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "Temp");
    const p = await makeProblem("p1", u.id);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.card.create({ data: { userId: u.id, problemId: p.id } });

    await deleteGroup(u.id, g.id);

    expect(await prisma.group.findUnique({ where: { id: g.id } })).toBeNull();
    expect(await prisma.groupProblem.count({ where: { groupId: g.id } })).toBe(0);
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1); // history preserved
  });

  it("refuses to delete a system group", async () => {
    const u = await makeUser();
    const sys = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Sys" } });
    await expect(deleteGroup(u.id, sys.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
```

- [ ] **Step 2: Push and confirm failure** — `git commit -am "test: createGroup/renameGroup/deleteGroup (failing)" && git push`; CI `db` fails on missing exports.

- [ ] **Step 3: Implement the three actions + cap constant**

Append to `lib/group-actions.ts`:

```ts
/** Abuse bound on owned groups per user. */
export const MAX_GROUPS_PER_USER = 100;

export async function createGroup(userId: string, name: string, description?: string): Promise<Group> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new GroupError("invalid_problem", "name required");
  const count = await prisma.group.count({ where: { ownerId: userId } });
  if (count >= MAX_GROUPS_PER_USER) throw new GroupError("cap_exceeded");
  return prisma.group.create({
    data: { ownerId: userId, visibility: "PRIVATE", name: trimmed, description: description?.trim() || null },
  });
}

export async function renameGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; description?: string },
): Promise<Group> {
  await assertOwnedGroup(userId, groupId);
  const data: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length === 0) throw new GroupError("invalid_problem", "name required");
    data.name = trimmed;
  }
  if (patch.description !== undefined) data.description = patch.description.trim() || null;
  return prisma.group.update({ where: { id: groupId }, data });
}

export async function deleteGroup(userId: string, groupId: string): Promise<void> {
  await assertOwnedGroup(userId, groupId);
  // GroupProblem + GroupActivation cascade via schema onDelete; Card/ReviewLog are unaffected.
  await prisma.group.delete({ where: { id: groupId } });
}
```

- [ ] **Step 4: Push and confirm pass** — `git commit -am "feat: createGroup/renameGroup/deleteGroup + group cap" && git push`; CI green.

---

## Task 3: activateGroup / deactivateGroup

**Files:**
- Modify: `lib/group-actions.ts`
- Modify: `lib/group-actions.db.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `lib/group-actions.db.test.ts`:

```ts
import { activateGroup, deactivateGroup } from "./group-actions";

describe("activateGroup", () => {
  it("activates an owned group and materializes its cards", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    const p1 = await makeProblem("a1", u.id);
    const p2 = await makeProblem("a2", u.id);
    await prisma.groupProblem.createMany({
      data: [{ groupId: g.id, problemId: p1.id }, { groupId: g.id, problemId: p2.id }],
    });

    await activateGroup(u.id, g.id);

    expect(await isGroupActive(u.id, g.id)).toBe(true);
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(2);
  });

  it("activates a SHARED group the caller does not own", async () => {
    const owner = await makeUser();
    const u = await makeUser({ groupsInitialized: true });
    const g = await prisma.group.create({ data: { ownerId: owner.id, visibility: "SHARED", name: "Shared" } });
    const p = await makeProblem("s1", null);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });

    await activateGroup(u.id, g.id);
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("refuses to activate another user's PRIVATE group (IDOR)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(a.id, "A");
    await expect(activateGroup(b.id, g.id)).rejects.toMatchObject({ code: "forbidden" });
    expect(await isGroupActive(b.id, g.id)).toBe(false);
  });

  it("is idempotent (re-activating does not duplicate cards)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    const p = await makeProblem("x", u.id);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await activateGroup(u.id, g.id);
    await activateGroup(u.id, g.id);
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe("deactivateGroup", () => {
  it("removes the caller's activation but keeps cards", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    const p = await makeProblem("y", u.id);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await activateGroup(u.id, g.id);

    await deactivateGroup(u.id, g.id);

    expect(await isGroupActive(u.id, g.id)).toBe(false);
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("only removes the caller's own activation", async () => {
    const a = await makeUser({ groupsInitialized: true });
    const b = await makeUser({ groupsInitialized: true });
    const g = await prisma.group.create({ data: { ownerId: a.id, visibility: "SHARED", name: "S" } });
    await prisma.groupActivation.createMany({
      data: [{ userId: a.id, groupId: g.id }, { userId: b.id, groupId: g.id }],
    });
    await deactivateGroup(a.id, g.id);
    expect(await isGroupActive(a.id, g.id)).toBe(false);
    expect(await isGroupActive(b.id, g.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Push and confirm failure.**

- [ ] **Step 3: Implement activate/deactivate**

Append to `lib/group-actions.ts` (add `ensureCards` to the existing imports — see note below):

```ts
export async function activateGroup(userId: string, groupId: string): Promise<void> {
  await assertStudyableGroup(userId, groupId);
  await prisma.groupActivation.createMany({
    data: [{ userId, groupId }],
    skipDuplicates: true,
  });
  const problemIds = await groupProblemIds(groupId);
  await ensureCards(userId, problemIds);
}

export async function deactivateGroup(userId: string, groupId: string): Promise<void> {
  await prisma.groupActivation.deleteMany({ where: { userId, groupId } });
}
```

Add this import at the top of `lib/group-actions.ts` (next to the prisma import):
```ts
import { ensureCards } from "@/lib/groups";
```

- [ ] **Step 4: Push and confirm pass.**

---

## Task 4: addProblemToGroup / removeProblemFromGroup

**Files:**
- Modify: `lib/group-actions.ts`
- Modify: `lib/group-actions.db.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `lib/group-actions.db.test.ts`:

```ts
import { addProblemToGroup, removeProblemFromGroup } from "./group-actions";

describe("addProblemToGroup", () => {
  it("adds a curated problem to an owned group", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "G");
    const p = await makeProblem("curated", null);
    await addProblemToGroup(u.id, g.id, p.id);
    expect(await prisma.groupProblem.count({ where: { groupId: g.id, problemId: p.id } })).toBe(1);
  });

  it("adds the caller's own authored problem", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "G");
    const p = await makeProblem("mine", u.id);
    await addProblemToGroup(u.id, g.id, p.id);
    expect(await prisma.groupProblem.count({ where: { groupId: g.id, problemId: p.id } })).toBe(1);
  });

  it("materializes a card when the group is active", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    await activateGroup(u.id, g.id);
    const p = await makeProblem("late", u.id);
    await addProblemToGroup(u.id, g.id, p.id);
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("REJECTS another user's authored problem (no membership created)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(b.id, "B");
    const theirs = await makeProblem("theirs", a.id);
    await expect(addProblemToGroup(b.id, g.id, theirs.id)).rejects.toMatchObject({ code: "invalid_problem" });
    expect(await prisma.groupProblem.count({ where: { groupId: g.id } })).toBe(0);
  });

  it("refuses to add to another user's group", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(a.id, "A");
    const p = await makeProblem("c", null);
    await expect(addProblemToGroup(b.id, g.id, p.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("is idempotent", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "G");
    const p = await makeProblem("c", null);
    await addProblemToGroup(u.id, g.id, p.id);
    await addProblemToGroup(u.id, g.id, p.id);
    expect(await prisma.groupProblem.count({ where: { groupId: g.id } })).toBe(1);
  });
});

describe("removeProblemFromGroup", () => {
  it("removes the membership but keeps the card + history", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    const p = await makeProblem("c", u.id);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.card.create({ data: { userId: u.id, problemId: p.id } });

    await removeProblemFromGroup(u.id, g.id, p.id);

    expect(await prisma.groupProblem.count({ where: { groupId: g.id, problemId: p.id } })).toBe(0);
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("refuses on another user's group", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(a.id, "A");
    const p = await makeProblem("c", null);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await expect(removeProblemFromGroup(b.id, g.id, p.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
```

- [ ] **Step 2: Push and confirm failure.**

- [ ] **Step 3: Implement add/remove**

Append to `lib/group-actions.ts`:

```ts
export async function addProblemToGroup(userId: string, groupId: string, problemId: string): Promise<void> {
  await assertOwnedGroup(userId, groupId);
  const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { createdById: true } });
  if (!problem) throw new GroupError("not_found");
  // Only curated (null) or the caller's own problems may be added.
  if (problem.createdById !== null && problem.createdById !== userId) {
    throw new GroupError("invalid_problem");
  }
  await prisma.groupProblem.createMany({ data: [{ groupId, problemId }], skipDuplicates: true });
  if (await isGroupActive(userId, groupId)) await ensureCards(userId, [problemId]);
}

export async function removeProblemFromGroup(userId: string, groupId: string, problemId: string): Promise<void> {
  await assertOwnedGroup(userId, groupId);
  await prisma.groupProblem.deleteMany({ where: { groupId, problemId } });
}
```

- [ ] **Step 4: Push and confirm pass.**

---

## Task 5: createProblemInGroup / editProblem (+ problem cap)

**Files:**
- Modify: `lib/group-actions.ts`
- Modify: `lib/group-actions.db.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `lib/group-actions.db.test.ts`:

```ts
import { MAX_AUTHORED_PROBLEMS_PER_USER, createProblemInGroup, editProblem } from "./group-actions";

describe("createProblemInGroup", () => {
  it("creates an owned problem, adds it to the group, with an opaque slug", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "G");
    const p = await createProblemInGroup(u.id, g.id, {
      title: "My Q",
      prompt: "prompt",
      approach: "approach",
      tags: ["graph"],
    });
    expect(p.createdById).toBe(u.id);
    expect(p.title).toBe("My Q");
    expect(p.slug).not.toBe("My Q");
    expect(p.slug.length).toBeGreaterThan(10); // uuid-ish, not derived from title
    expect(await prisma.groupProblem.count({ where: { groupId: g.id, problemId: p.id } })).toBe(1);
  });

  it("materializes a card when the group is active", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    await activateGroup(u.id, g.id);
    const p = await createProblemInGroup(u.id, g.id, { title: "Q", prompt: "p", approach: "a", tags: [] });
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("refuses to author into another user's group", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(a.id, "A");
    await expect(
      createProblemInGroup(b.id, g.id, { title: "Q", prompt: "p", approach: "a", tags: [] }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a blank title", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "G");
    await expect(
      createProblemInGroup(u.id, g.id, { title: "  ", prompt: "p", approach: "a", tags: [] }),
    ).rejects.toMatchObject({ code: "invalid_problem" });
  });

  it("enforces the per-user authored-problem cap", async () => {
    const u = await makeUser();
    const g = await createGroup(u.id, "G");
    await prisma.problem.createMany({
      data: Array.from({ length: MAX_AUTHORED_PROBLEMS_PER_USER }, (_, i) => ({
        slug: `cap-${i}`,
        createdById: u.id,
        title: `t${i}`,
        source: "custom",
        prompt: "p",
        approach: "a",
        tags: [],
      })),
    });
    await expect(
      createProblemInGroup(u.id, g.id, { title: "one too many", prompt: "p", approach: "a", tags: [] }),
    ).rejects.toMatchObject({ code: "cap_exceeded" });
  });
});

describe("editProblem", () => {
  it("edits an owned problem", async () => {
    const u = await makeUser();
    const p = await makeProblem("mine", u.id);
    const updated = await editProblem(u.id, p.id, { title: "Edited", prompt: "np" });
    expect(updated.title).toBe("Edited");
    expect(updated.prompt).toBe("np");
  });

  it("refuses to edit a curated problem", async () => {
    const u = await makeUser();
    const p = await makeProblem("curated", null);
    await expect(editProblem(u.id, p.id, { title: "hax" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses to edit another user's authored problem", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const p = await makeProblem("theirs", a.id);
    await expect(editProblem(b.id, p.id, { title: "hax" })).rejects.toMatchObject({ code: "forbidden" });
  });
});
```

- [ ] **Step 2: Push and confirm failure.**

- [ ] **Step 3: Implement createProblemInGroup / editProblem + cap + slug**

Add this import at the top of `lib/group-actions.ts`:
```ts
import { randomUUID } from "node:crypto";
```

Append to `lib/group-actions.ts`:

```ts
/** Abuse bound on authored problems per user. */
export const MAX_AUTHORED_PROBLEMS_PER_USER = 5000;

export interface NewProblemInput {
  title: string;
  prompt: string;
  approach: string;
  tags: string[];
  url?: string;
}

export async function createProblemInGroup(
  userId: string,
  groupId: string,
  input: NewProblemInput,
): Promise<Problem> {
  await assertOwnedGroup(userId, groupId);
  const title = input.title.trim();
  if (title.length === 0) throw new GroupError("invalid_problem", "title required");
  const count = await prisma.problem.count({ where: { createdById: userId } });
  if (count >= MAX_AUTHORED_PROBLEMS_PER_USER) throw new GroupError("cap_exceeded");

  const problem = await prisma.problem.create({
    data: {
      slug: randomUUID(), // opaque; never derived from title/userId
      createdById: userId,
      title,
      source: "custom",
      url: input.url?.trim() || null,
      prompt: input.prompt,
      approach: input.approach,
      tags: input.tags,
    },
  });
  await prisma.groupProblem.create({ data: { groupId, problemId: problem.id } });
  if (await isGroupActive(userId, groupId)) await ensureCards(userId, [problem.id]);
  return problem;
}

export interface EditProblemInput {
  title?: string;
  prompt?: string;
  approach?: string;
  tags?: string[];
  url?: string;
}

export async function editProblem(userId: string, problemId: string, patch: EditProblemInput): Promise<Problem> {
  await assertOwnedProblem(userId, problemId);
  const data: EditProblemInput & { url?: string | null } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length === 0) throw new GroupError("invalid_problem", "title required");
    data.title = t;
  }
  if (patch.prompt !== undefined) data.prompt = patch.prompt;
  if (patch.approach !== undefined) data.approach = patch.approach;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.url !== undefined) data.url = patch.url.trim() || null;
  return prisma.problem.update({ where: { id: problemId }, data });
}
```

- [ ] **Step 4: Push and confirm pass** — full `db` suite green.

---

## Task 6: Consolidate imports & final green

**Files:**
- Modify: `lib/group-actions.db.test.ts`

The previous tasks each added a separate `import { ... } from "./group-actions"` line (one per task, for readability while building). They all resolve to the same module, which is valid TypeScript, but consolidating avoids confusion.

- [ ] **Step 1: Merge the per-task imports**

In `lib/group-actions.db.test.ts`, replace the multiple `import { ... } from "./group-actions";` statements with a single consolidated import listing every symbol used:

```ts
import {
  GroupError,
  MAX_GROUPS_PER_USER,
  MAX_AUTHORED_PROBLEMS_PER_USER,
  assertOwnedGroup,
  assertOwnedProblem,
  assertStudyableGroup,
  isGroupActive,
  createGroup,
  renameGroup,
  deleteGroup,
  activateGroup,
  deactivateGroup,
  addProblemToGroup,
  removeProblemFromGroup,
  createProblemInGroup,
  editProblem,
} from "./group-actions";
```

(`GroupError` is imported even though tests assert via `toMatchObject({ code })`; keep it only if a test references the class directly — otherwise drop it to avoid an unused-import lint. As of this plan no test references the class by name, so OMIT `GroupError` from the consolidated import.)

- [ ] **Step 2: Push and confirm the whole suite is green** — `git commit -am "test: consolidate group-actions imports" && git push`; CI green (typecheck + unit + all db tests).

---

## Self-review checklist (completed during authoring)

- **Spec §3 coverage:** `createGroup` (cap) ✓; `renameGroup`/`deleteGroup` (owner guard, system-group immunity) ✓; `activateGroup`/`deactivateGroup` (studyable guard, ensureCards, user-scoped activation) ✓; `addProblemToGroup` (owner guard + hard-reject non-owned/non-null problem + active-ensure) ✓; `removeProblemFromGroup` (group-owner guard) ✓; `createProblemInGroup` (owner guard, cap, opaque slug, active-ensure) ✓; `editProblem` (owned-only, curated read-only) ✓. Guards `assertOwnedGroup`/`assertOwnedProblem`/`assertStudyableGroup` ✓.
- **Deferred to Plan 3 (intentionally absent):** `duplicateGroup` (deep-copy), `studyGroup` focus query, ALL `"use server"` wrappers (`auth()` + `rateLimit()`), the `/groups` + `/groups/[id]` UI, orphaned-card list, Groups nav, "Study this group" focus session. `rateLimit()` is applied in the Plan-3 wrappers (request-keyed); this plan enforces only the per-user data caps.
- **IDOR negatives present:** other-user group rename/delete/activate/add/remove/author, curated-problem edit, cross-user problem attach, system-group delete — each asserts both the throw AND (where relevant) that no row was written.
- **Type consistency:** `GroupError.code ∈ {forbidden, not_found, invalid_problem, cap_exceeded}`; guards return `Group`/`Problem`; `createGroup(userId, name, description?)`, `renameGroup(userId, groupId, {name?,description?})`, `activateGroup(userId, groupId)`, `addProblemToGroup(userId, groupId, problemId)`, `createProblemInGroup(userId, groupId, NewProblemInput)`, `editProblem(userId, problemId, EditProblemInput)` — names/shapes consistent across tasks. `ensureCards`/`isGroupActive`/`groupProblemIds` reused, not redefined.
- **next-auth avoidance:** `lib/group-actions.ts` imports only `@prisma/client`, `@/lib/db`, `@/lib/groups`, `node:crypto` — no `next/*` or `next-auth`, so it loads cleanly under vitest (the Plan-1 T1.5 failure mode is avoided).
- **Validation note:** `invalid_problem` is reused for blank name/title (slightly overloaded but adequate; the Plan-3 wrappers translate codes to user-facing copy). Not worth a separate `validation` code in this slice.
