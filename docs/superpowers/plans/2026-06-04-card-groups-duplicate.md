# Card Groups — Plan 3 of 4: Duplicate (deep-copy) & Focus-session logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the last CI-testable backend logic for card groups — `duplicateGroup` (deep-copy a curated shared group into an owned, editable copy with SM-2 progress carried over) and the focus-session scoping helpers ("Study this group").

**Architecture:** `duplicateGroup` lives in a new focused module `lib/group-duplicate.ts` (the deep-copy is the most complex single operation; isolating it keeps `lib/group-actions.ts` lean). It reuses `GroupError`, the caps, and `MAX_*` from `lib/group-actions.ts`. The focus-session guard + `where`-fragment are small and append to `lib/group-actions.ts` next to the existing activation logic. All functions take an explicit `userId` (no `next-auth`), so they're fully DB-testable in CI. The `/groups` UI and the thin `auth()`/`rateLimit()` `"use server"` wrappers are Plan 4.

**Tech Stack:** TypeScript, Prisma 6 + PostgreSQL, vitest 4 (DB project), verified in GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-06-04-card-groups-design.md` — Data-model "Duplicate (deep-copy; curated-only; transactional)" rule + the §3 `duplicateGroup` / `studyGroup` predicates. **Plain deep-copy** model (NOT copy-on-write — that was explicitly rejected).

**Verification:** No local Node/Postgres. Each task's tests run in CI on push (`.github/workflows/test.yml`). "Run the test" below means **push and read CI via `gh`**.

---

## Background the implementer needs (already on `main`, CI-green)

- `lib/group-actions.ts` exports: `GroupError` (codes `forbidden|not_found|invalid_problem|cap_exceeded`), `MAX_GROUPS_PER_USER` (100), `MAX_AUTHORED_PROBLEMS_PER_USER` (5000), `assertStudyableGroup(userId, groupId)`, `isGroupActive(userId, groupId)`, `groupProblemIds(groupId)`, and the group/problem mutation actions.
- Schema: `Group { id, key?, ownerId?, visibility (PRIVATE|SHARED), name, description?, sourceGroupId?, ... }`, `GroupProblem { groupId, problemId, @@id }`, `Problem { id, slug, createdById?, title, source, url?, prompt, approach, tags, @@unique([createdById, slug]) }`, `Card { userId, problemId, ease, intervalDays, reps, lapses, dueAt, lastReviewedAt, leech, @@unique([userId, problemId]) }`, `GroupActivation { userId, groupId, @@id }`.
- DB tests: `*.db.test.ts`, import `prisma` from `@/lib/db`, `makeUser({groupsInitialized?})` / `makeProblem(slug, createdById=null)` from `@/test/db/factory`. Truncate between tests; serial. `@/` alias configured per-project.
- `makeProblem(slug, createdById)` sets `title = slug`, `source = "test"`, `prompt = "prompt "+slug`, `approach = "approach "+slug`, `tags = []`.

Spec rules this plan enforces:
- **Duplicate is restricted to system-curated SHARED groups:** `source.ownerId === null && source.visibility === "SHARED"`. Anything else → `forbidden`.
- Deep-copy in one transaction: new owned `Group { ownerId: userId, visibility: PRIVATE, sourceGroupId: source.id }`, a NEW `Problem` per source problem (`createdById = userId`, **opaque `randomUUID()` slug**, content copied), a `GroupProblem` link, and a `Card` **carrying over the user's SM-2 state** from the source curated card if one exists (else defaults). The **source group/problems/cards are untouched**. New group is **PRIVATE + inactive** (no activation row).
- Name disambiguation: `"<name> (copy)"`, then `"(copy 2)"`, `"(copy 3)"`…
- Caps: respect `MAX_GROUPS_PER_USER` and `MAX_AUTHORED_PROBLEMS_PER_USER` (the copy adds 1 group + N problems).
- Focus session (`studyGroup`): allowed only for a group that is `assertStudyableGroup` AND currently active for the user; scope cards to that one group + that user.

---

## File structure

- **Create `lib/group-duplicate.ts`** — `duplicateGroup(userId, sourceGroupId)` + private `disambiguatedCopyName`. One responsibility: the curated-group deep-copy. Imports `GroupError`/caps from `lib/group-actions.ts`, `prisma`, `node:crypto`.
- **Create `lib/group-duplicate.db.test.ts`** — deep-copy behavior + isolation + SM-2 carryover + caps + IDOR.
- **Modify `lib/group-actions.ts`** — append `assertActiveStudyableGroup` + `focusGroupCardWhere`.
- **Modify `lib/group-actions.db.test.ts`** — append focus-session tests.

---

## Task 1: `duplicateGroup` deep-copy

**Files:**
- Create: `lib/group-duplicate.ts`
- Create: `lib/group-duplicate.db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/group-duplicate.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { duplicateGroup } from "./group-duplicate";

/** A curated SHARED system group with `n` curated problems attached. */
async function curatedGroup(name: string, slugs: string[]) {
  const group = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name } });
  for (const slug of slugs) {
    const p = await makeProblem(slug, null);
    await prisma.groupProblem.create({ data: { groupId: group.id, problemId: p.id } });
  }
  return group;
}

describe("duplicateGroup", () => {
  it("deep-copies a curated group into a PRIVATE owned group with new owned problems", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await curatedGroup("NeetCode 150", ["two-sum", "valid-anagram"]);

    const copy = await duplicateGroup(u.id, src.id);

    expect(copy.ownerId).toBe(u.id);
    expect(copy.visibility).toBe("PRIVATE");
    expect(copy.sourceGroupId).toBe(src.id);
    expect(copy.name).toBe("NeetCode 150 (copy)");

    const members = await prisma.groupProblem.findMany({
      where: { groupId: copy.id },
      include: { problem: true },
    });
    expect(members).toHaveLength(2);
    for (const m of members) {
      expect(m.problem.createdById).toBe(u.id); // owned copy, editable
      expect(["two-sum", "valid-anagram"]).toContain(m.problem.title); // content copied
    }
    // The copied problems are NEW rows, distinct from the curated originals.
    const curatedIds = (await prisma.problem.findMany({ where: { createdById: null }, select: { id: true } })).map((p) => p.id);
    expect(members.every((m) => !curatedIds.includes(m.problemId))).toBe(true);
  });

  it("leaves the source group, its problems, and the user's source cards untouched", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await curatedGroup("Src", ["a", "b"]);
    const before = await prisma.problem.count({ where: { createdById: null } });

    await duplicateGroup(u.id, src.id);

    expect(await prisma.groupProblem.count({ where: { groupId: src.id } })).toBe(2);
    expect(await prisma.problem.count({ where: { createdById: null } })).toBe(before); // no curated rows added/removed
  });

  it("carries over SM-2 progress from the user's existing card on the source problem", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const group = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "S" } });
    const p = await makeProblem("studied", null);
    await prisma.groupProblem.create({ data: { groupId: group.id, problemId: p.id } });
    await prisma.card.create({
      data: { userId: u.id, problemId: p.id, ease: 1.9, intervalDays: 12, reps: 5, lapses: 2, leech: true },
    });

    const copy = await duplicateGroup(u.id, group.id);

    const newMember = await prisma.groupProblem.findFirst({ where: { groupId: copy.id } });
    const newCard = await prisma.card.findUnique({
      where: { userId_problemId: { userId: u.id, problemId: newMember!.problemId } },
    });
    expect(newCard).not.toBeNull();
    expect(newCard!.ease).toBe(1.9);
    expect(newCard!.intervalDays).toBe(12);
    expect(newCard!.reps).toBe(5);
    expect(newCard!.lapses).toBe(2);
    expect(newCard!.leech).toBe(true);
    // Source card is intact.
    const srcCard = await prisma.card.findUnique({ where: { userId_problemId: { userId: u.id, problemId: p.id } } });
    expect(srcCard!.reps).toBe(5);
  });

  it("uses default SM-2 when the user has no card on the source problem", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await curatedGroup("Fresh", ["x"]);

    const copy = await duplicateGroup(u.id, src.id);

    const newMember = await prisma.groupProblem.findFirst({ where: { groupId: copy.id } });
    const newCard = await prisma.card.findUnique({
      where: { userId_problemId: { userId: u.id, problemId: newMember!.problemId } },
    });
    expect(newCard!.ease).toBe(2.5); // schema default
    expect(newCard!.reps).toBe(0);
  });

  it("creates the copy INACTIVE (no activation row)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await curatedGroup("S", ["a"]);
    const copy = await duplicateGroup(u.id, src.id);
    expect(await prisma.groupActivation.count({ where: { userId: u.id, groupId: copy.id } })).toBe(0);
  });

  it("disambiguates repeated copies", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await curatedGroup("Deck", ["a"]);
    const c1 = await duplicateGroup(u.id, src.id);
    const c2 = await duplicateGroup(u.id, src.id);
    const c3 = await duplicateGroup(u.id, src.id);
    expect(c1.name).toBe("Deck (copy)");
    expect(c2.name).toBe("Deck (copy 2)");
    expect(c3.name).toBe("Deck (copy 3)");
  });

  it("refuses to duplicate a PRIVATE group", async () => {
    const u = await makeUser();
    const priv = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "P" } });
    await expect(duplicateGroup(u.id, priv.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses to duplicate a user-authored SHARED group (curated-only)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const shared = await prisma.group.create({ data: { ownerId: a.id, visibility: "SHARED", name: "Authored" } });
    await expect(duplicateGroup(b.id, shared.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("throws not_found for a missing group", async () => {
    const u = await makeUser();
    await expect(duplicateGroup(u.id, "nope")).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Push and confirm failure** — `git add -A && git commit -m "test: duplicateGroup (failing)" && git push`; CI `db` fails to resolve `./group-duplicate`.

- [ ] **Step 3: Implement `lib/group-duplicate.ts`**

Create `lib/group-duplicate.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Group } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GroupError, MAX_GROUPS_PER_USER, MAX_AUTHORED_PROBLEMS_PER_USER } from "@/lib/group-actions";

/** "<base> (copy)", then "(copy 2)", "(copy 3)" … unique among the user's owned groups. */
async function disambiguatedCopyName(userId: string, base: string): Promise<string> {
  const existing = await prisma.group.findMany({
    where: { ownerId: userId, name: { startsWith: `${base} (copy` } },
    select: { name: true },
  });
  const taken = new Set(existing.map((g) => g.name));
  if (!taken.has(`${base} (copy)`)) return `${base} (copy)`;
  let n = 2;
  while (taken.has(`${base} (copy ${n})`)) n += 1;
  return `${base} (copy ${n})`;
}

/**
 * Deep-copy a system-curated SHARED group into a PRIVATE owned group: new owned Problem
 * rows (opaque slugs), GroupProblem links, and Cards that carry over the user's SM-2 state
 * from the source curated card when present. Source group/problems/cards are untouched.
 * The copy is created INACTIVE; the user activates it explicitly. Curated-only by design.
 */
export async function duplicateGroup(userId: string, sourceGroupId: string): Promise<Group> {
  const source = await prisma.group.findUnique({ where: { id: sourceGroupId } });
  if (!source) throw new GroupError("not_found");
  if (source.ownerId !== null || source.visibility !== "SHARED") throw new GroupError("forbidden");

  if ((await prisma.group.count({ where: { ownerId: userId } })) >= MAX_GROUPS_PER_USER) {
    throw new GroupError("cap_exceeded");
  }

  const members = await prisma.groupProblem.findMany({
    where: { groupId: sourceGroupId },
    select: { problem: true },
  });
  const sourceProblems = members.map((m) => m.problem);

  if ((await prisma.problem.count({ where: { createdById: userId } })) + sourceProblems.length > MAX_AUTHORED_PROBLEMS_PER_USER) {
    throw new GroupError("cap_exceeded");
  }

  // The user's existing SM-2 state on the source problems, to carry over.
  const priorCards = await prisma.card.findMany({
    where: { userId, problemId: { in: sourceProblems.map((p) => p.id) } },
  });
  const priorBySource = new Map(priorCards.map((c) => [c.problemId, c]));

  const name = await disambiguatedCopyName(userId, source.name);

  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        ownerId: userId,
        visibility: "PRIVATE",
        sourceGroupId: source.id,
        name,
        description: source.description,
      },
    });
    for (const sp of sourceProblems) {
      const np = await tx.problem.create({
        data: {
          slug: randomUUID(),
          createdById: userId,
          title: sp.title,
          source: sp.source,
          url: sp.url,
          prompt: sp.prompt,
          approach: sp.approach,
          tags: sp.tags,
        },
      });
      await tx.groupProblem.create({ data: { groupId: group.id, problemId: np.id } });
      const prior = priorBySource.get(sp.id);
      await tx.card.create({
        data: {
          userId,
          problemId: np.id,
          // Carry over SM-2 when the user already studied the source; else schema defaults.
          ease: prior?.ease,
          intervalDays: prior?.intervalDays,
          reps: prior?.reps,
          lapses: prior?.lapses,
          dueAt: prior?.dueAt,
          lastReviewedAt: prior?.lastReviewedAt,
          leech: prior?.leech,
        },
      });
    }
    return group;
  });
}
```

> Note on `ease: prior?.ease`: when `prior` is `undefined`, `prior?.ease` is `undefined`, and Prisma applies the schema default (`ease 2.5`, `reps 0`, `dueAt now()`, etc.). When `prior` exists, the stored values are used. This is the SM-2 carry-over.

- [ ] **Step 4: Push and confirm pass** — `git add -A && git commit -m "feat: duplicateGroup deep-copy (curated-only, SM-2 carryover)" && git push`; CI green.

---

## Task 2: Focus-session guard + scoping helper

**Files:**
- Modify: `lib/group-actions.ts`
- Modify: `lib/group-actions.db.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `lib/group-actions.db.test.ts`:

```ts
import { assertActiveStudyableGroup, focusGroupCardWhere } from "./group-actions";

describe("assertActiveStudyableGroup", () => {
  it("passes for a studyable, active group", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });
    await expect(assertActiveStudyableGroup(u.id, g.id)).resolves.toBeUndefined();
  });

  it("rejects a studyable group that is NOT active", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await createGroup(u.id, "G");
    await expect(assertActiveStudyableGroup(u.id, g.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects another user's PRIVATE group (IDOR)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await createGroup(a.id, "A");
    await prisma.groupActivation.create({ data: { userId: a.id, groupId: g.id } });
    await expect(assertActiveStudyableGroup(b.id, g.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("focusGroupCardWhere", () => {
  it("matches only the user's cards whose problem is in that group", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g1 = await createGroup(u.id, "G1");
    const g2 = await createGroup(u.id, "G2");
    const p1 = await makeProblem("in", u.id);
    const p2 = await makeProblem("out", u.id);
    await prisma.groupProblem.create({ data: { groupId: g1.id, problemId: p1.id } });
    await prisma.groupProblem.create({ data: { groupId: g2.id, problemId: p2.id } });
    await prisma.card.create({ data: { userId: u.id, problemId: p1.id } });
    await prisma.card.create({ data: { userId: u.id, problemId: p2.id } });

    const cards = await prisma.card.findMany({ where: focusGroupCardWhere(u.id, g1.id) });
    expect(cards.map((c) => c.problemId)).toEqual([p1.id]);
  });

  it("never returns another user's cards", async () => {
    const a = await makeUser({ groupsInitialized: true });
    const b = await makeUser({ groupsInitialized: true });
    const g = await prisma.group.create({ data: { ownerId: a.id, visibility: "SHARED", name: "S" } });
    const p = await makeProblem("p", null);
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.card.create({ data: { userId: a.id, problemId: p.id } });
    await prisma.card.create({ data: { userId: b.id, problemId: p.id } });

    const cards = await prisma.card.findMany({ where: focusGroupCardWhere(a.id, g.id) });
    expect(cards.every((c) => c.userId === a.id)).toBe(true);
    expect(cards).toHaveLength(1);
  });
});
```

Add `assertActiveStudyableGroup, focusGroupCardWhere` to the existing consolidated `import { ... } from "./group-actions";` block at the top of the test file.

- [ ] **Step 2: Push and confirm failure.**

- [ ] **Step 3: Implement the focus helpers**

Add `import type { Prisma } ...` to the top of `lib/group-actions.ts` (merge into the existing `@prisma/client` import — it becomes `import type { Group, Problem, Prisma } from "@prisma/client";`). Append to `lib/group-actions.ts`:

```ts
/** Guard for the per-group focus session: the group must be studyable AND currently active for the user. */
export async function assertActiveStudyableGroup(userId: string, groupId: string): Promise<void> {
  await assertStudyableGroup(userId, groupId);
  if (!(await isGroupActive(userId, groupId))) {
    throw new GroupError("forbidden", "group is not active");
  }
}

/** Cards belonging to the user whose problem is in exactly this one group. userId-scoped. */
export function focusGroupCardWhere(userId: string, groupId: string): Prisma.CardWhereInput {
  return { userId, problem: { groups: { some: { groupId } } } };
}
```

- [ ] **Step 4: Push and confirm pass** — full `db` suite green.

---

## Self-review checklist (completed during authoring)

- **Spec coverage:** Duplicate deep-copy — curated-only restriction ✓, new owned Problems with opaque slugs ✓, content copy ✓, GroupProblem links ✓, SM-2 carryover from source card / defaults ✓, source untouched ✓, PRIVATE + inactive ✓, name disambiguation ✓, caps (group + problem) ✓, not_found ✓. Focus session — `assertActiveStudyableGroup` (studyable AND active, IDOR-rejecting) ✓, `focusGroupCardWhere` userId-scoped to one group ✓.
- **Deferred to Plan 4:** the `/groups` + `/groups/[id]` UI, the `"use server"` wrappers (`auth()` + `rateLimit()` + `revalidatePath`), the "Make my own copy" + "Study this group" buttons, the post-duplicate "deactivate the original?" prompt, the orphaned-card list, the Groups nav item. (The done-state Groups CTA already shipped in Plan 1.)
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `duplicateGroup(userId, sourceGroupId): Promise<Group>`; `assertActiveStudyableGroup(userId, groupId): Promise<void>`; `focusGroupCardWhere(userId, groupId): Prisma.CardWhereInput`. Reuses `GroupError`, `MAX_GROUPS_PER_USER`, `MAX_AUTHORED_PROBLEMS_PER_USER`, `assertStudyableGroup`, `isGroupActive` from `lib/group-actions.ts` — no redefinition. `Card` SM-2 field names (`ease`, `intervalDays`, `reps`, `lapses`, `dueAt`, `lastReviewedAt`, `leech`) match the schema.
- **next-auth avoidance:** both new modules import only `@prisma/client`, `@/lib/db`, `@/lib/group-actions`, `node:crypto` — no `next/*`, so they load under vitest.
- **Transaction safety:** all writes in `duplicateGroup` use the `tx` client; reads (caps, members, prior cards, name) happen before the transaction (acceptable — a benign abuse-bound race like the other cap checks, not an integrity risk).
