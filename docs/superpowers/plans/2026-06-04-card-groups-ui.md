# Card Groups — Plan 4 of 4: Groups UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **For the page/component tasks (3–6), also use superpowers:frontend-design:frontend-design** to match the existing aesthetic.

**Goal:** Ship the user-facing `/groups` experience — a sectioned list (Active / Your groups / Browse shared), a group-detail page with authoring/editing, activate/deactivate toggles, "Make my own copy" (Duplicate), and a per-group "Study this group" focus session — wiring the UI to the already-built, CI-tested backend.

**Architecture:** A new CI-tested view-model module `lib/group-views.ts` assembles the read data (group summaries with due counts, group detail, orphaned count) as pure `userId`-scoped functions. Thin `"use server"` wrappers in `app/groups/actions.ts` do `auth()` + `rateLimit()` + delegate to `lib/group-actions.ts` / `lib/group-duplicate.ts` + `revalidatePath`. RSC pages render the view-models and post to the wrappers. Verified by reading + a Railway deploy preview (no browser tests in CI).

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma 6, Tailwind (existing token vocabulary), vitest DB project for `lib/group-views.ts`.

**Spec:** `docs/superpowers/specs/2026-06-04-card-groups-design.md` §3 "UI". Backend already on `main`: `lib/group-actions.ts` (guards + actions + `assertActiveStudyableGroup` + `focusGroupCardWhere`), `lib/group-duplicate.ts` (`duplicateGroup`), `lib/active-cards.ts` (`activeCardWhere`, `hasAnyActiveCard`).

**Verification:** `lib/group-views.ts` is CI-tested (push → `gh`). The pages/wrappers are verified by (a) `tsc` in CI, (b) reading, (c) a **Railway deploy of this branch** the user clicks through. No local browser.

---

## Design decisions (from brainstorming)

- **Layout:** sectioned single column matching `today`/`review` (mono labels, `surface` cards, phosphor-green accent). Sections: **ACTIVE**, **YOUR GROUPS**, **BROWSE SHARED**, plus a footer link "N cards in no active group →".
- **Scope:** everything — list, detail, activate/deactivate, create group, duplicate, author/edit/remove cards, and "Study this group".
- **Focus session:** included — a per-group review at `/groups/[id]/study` reusing the existing `ReviewCard`.

## Token vocabulary (existing — use these)

Surfaces `bg surface surface-2`; borders `border border-hi`; text `fg fg-2 fg-3 fg-4`; accent `accent accent-hover accent-fg`; `warn danger`; radius `rounded-lg`. Label style: `class="label"` (uppercase mono caption). Primary button: `h-12 rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover`. Secondary: `border border-border bg-surface ... hover:border-border-hi`. Mono numerals: `class="mono tabular"`.

## Conventions (match existing server actions)

Every wrapper: `"use server"` → `const session = await auth(); if (!session?.user?.id) redirect("/signin");` → `rateLimit({ key: \`groups:<action>:${userId}\`, limit, windowMs })` for mutating/creating actions → `try { await <libFn>(userId, ...) } catch (e) { redirect("/groups?error=<code>") }` → `revalidatePath("/groups")` (+ `/today`, `/review` when cards change) → `redirect` as needed. `GroupError.code` maps to the `?error=` query.

---

## File structure

- **Create `lib/group-views.ts`** — read-model: `listGroupsView(userId)`, `groupDetailView(userId, groupId)`. Pure, CI-tested.
- **Create `lib/group-views.db.test.ts`** — view-model tests.
- **Create `app/groups/actions.ts`** — `"use server"` wrappers for: create/rename/delete/activate/deactivate group, add/remove/create/edit problem, duplicate. Thin; delegate to lib.
- **Create `app/groups/page.tsx`** — sectioned list (server component).
- **Create `app/groups/GroupToggle.tsx`** — activate/deactivate toggle (form button).
- **Create `app/groups/[id]/page.tsx`** — detail (owned vs shared variants).
- **Create `app/groups/[id]/ProblemForm.tsx`** — author/edit a card (client component with textareas).
- **Create `app/groups/[id]/study/page.tsx`** — focus session (reuses `ReviewCard`).
- **Modify `app/today/page.tsx`** — add a "groups" link in the header.

---

## Task 1: `lib/group-views.ts` read-model (CI-tested)

**Files:**
- Create: `lib/group-views.ts`, `lib/group-views.db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/group-views.db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { listGroupsView, groupDetailView } from "./group-views";

const PAST = new Date("2020-01-01T00:00:00Z");

describe("listGroupsView", () => {
  it("partitions active / owned / shared-catalog and counts due cards", async () => {
    const u = await makeUser({ groupsInitialized: true });
    // Owned + active group with one due card.
    const active = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "Active" } });
    const p = await makeProblem("p", u.id);
    await prisma.groupProblem.create({ data: { groupId: active.id, problemId: p.id } });
    await prisma.card.create({ data: { userId: u.id, problemId: p.id, dueAt: PAST } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: active.id } });
    // Owned, not active.
    await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "Owned" } });
    // Shared system catalog, not owned/active.
    await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Catalog" } });

    const view = await listGroupsView(u.id);

    expect(view.active.map((g) => g.name)).toEqual(["Active"]);
    expect(view.active[0].dueCount).toBe(1);
    expect(view.active[0].isActive).toBe(true);
    expect(view.owned.map((g) => g.name)).toEqual(["Owned"]);
    expect(view.sharedCatalog.map((g) => g.name)).toEqual(["Catalog"]);
  });

  it("counts orphaned cards (user cards in no active group)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const orphan = await makeProblem("orphan", u.id);
    await prisma.card.create({ data: { userId: u.id, problemId: orphan.id } }); // in no group
    const view = await listGroupsView(u.id);
    expect(view.orphanedCount).toBe(1);
  });

  it("does not list another user's private groups", async () => {
    const a = await makeUser();
    const b = await makeUser({ groupsInitialized: true });
    await prisma.group.create({ data: { ownerId: a.id, visibility: "PRIVATE", name: "A-private" } });
    const view = await listGroupsView(b.id);
    expect([...view.active, ...view.owned, ...view.sharedCatalog].some((g) => g.name === "A-private")).toBe(false);
  });
});

describe("groupDetailView", () => {
  it("returns an owned group with its problems and ownership flags", async () => {
    const u = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    const mine = await makeProblem("mine", u.id);
    const curated = await makeProblem("curated", null);
    await prisma.groupProblem.createMany({
      data: [{ groupId: g.id, problemId: mine.id }, { groupId: g.id, problemId: curated.id }],
    });

    const detail = await groupDetailView(u.id, g.id);
    expect(detail).not.toBeNull();
    expect(detail!.isOwned).toBe(true);
    expect(detail!.canDuplicate).toBe(false);
    const byTitle = Object.fromEntries(detail!.problems.map((p) => [p.title, p.isOwned]));
    expect(byTitle["mine"]).toBe(true);
    expect(byTitle["curated"]).toBe(false);
  });

  it("returns a shared system group as duplicatable, read-only", async () => {
    const u = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Sys" } });
    const detail = await groupDetailView(u.id, g.id);
    expect(detail!.isOwned).toBe(false);
    expect(detail!.canDuplicate).toBe(true);
  });

  it("returns null for another user's private group (no access)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: a.id, visibility: "PRIVATE", name: "A" } });
    expect(await groupDetailView(b.id, g.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Push and confirm failure** — `git add -A && git commit -m "test: group-views (failing)" && git push`; CI red (module missing).

- [ ] **Step 3: Implement `lib/group-views.ts`**

Create `lib/group-views.ts`:

```ts
import { prisma } from "@/lib/db";
import { activeCardWhere } from "@/lib/active-cards";
import { focusGroupCardWhere } from "@/lib/group-actions";

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "SHARED";
  isOwned: boolean;
  isSystem: boolean;
  isActive: boolean;
  problemCount: number;
  dueCount: number;
}

export interface GroupsView {
  active: GroupSummary[];
  owned: GroupSummary[];
  sharedCatalog: GroupSummary[];
  orphanedCount: number;
}

export async function listGroupsView(userId: string): Promise<GroupsView> {
  const activations = await prisma.groupActivation.findMany({ where: { userId }, select: { groupId: true } });
  const activeIds = new Set(activations.map((a) => a.groupId));

  // Visible groups: owned by the user, OR activated, OR shared.
  const groups = await prisma.group.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: [...activeIds] } }, { visibility: "SHARED" }] },
    orderBy: [{ ownerId: "asc" }, { name: "asc" }],
  });

  const now = new Date();
  const summaries: GroupSummary[] = [];
  for (const g of groups) {
    const isActive = activeIds.has(g.id);
    const problemCount = await prisma.groupProblem.count({ where: { groupId: g.id } });
    const dueCount = isActive
      ? await prisma.card.count({ where: { ...focusGroupCardWhere(userId, g.id), dueAt: { lte: now } } })
      : 0;
    summaries.push({
      id: g.id,
      name: g.name,
      description: g.description,
      visibility: g.visibility,
      isOwned: g.ownerId === userId,
      isSystem: g.ownerId === null,
      isActive,
      problemCount,
      dueCount,
    });
  }

  const orphanedCount = await prisma.card.count({
    where: { userId, NOT: activeCardWhere(userId, true) },
  });

  return {
    active: summaries.filter((s) => s.isActive),
    owned: summaries.filter((s) => !s.isActive && s.isOwned),
    sharedCatalog: summaries.filter((s) => !s.isActive && !s.isOwned && s.visibility === "SHARED"),
    orphanedCount,
  };
}

export interface ProblemRow {
  id: string;
  title: string;
  tags: string[];
  isOwned: boolean;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "SHARED";
  isOwned: boolean;
  isSystem: boolean;
  isActive: boolean;
  canDuplicate: boolean;
  problems: ProblemRow[];
}

/** null when the group does not exist or the user may neither own nor study it. */
export async function groupDetailView(userId: string, groupId: string): Promise<GroupDetail | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { problems: { include: { problem: true }, orderBy: { addedAt: "asc" } } },
  });
  if (!group) return null;
  const isOwned = group.ownerId === userId;
  const visible = isOwned || group.visibility === "SHARED";
  if (!visible) return null;

  const isActive =
    (await prisma.groupActivation.count({ where: { userId, groupId } })) > 0;

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    visibility: group.visibility,
    isOwned,
    isSystem: group.ownerId === null,
    isActive,
    canDuplicate: group.ownerId === null && group.visibility === "SHARED",
    problems: group.problems.map((gp) => ({
      id: gp.problem.id,
      title: gp.problem.title,
      tags: gp.problem.tags,
      isOwned: gp.problem.createdById === userId,
    })),
  };
}
```

> `NOT: activeCardWhere(userId, true)` negates the active filter to count orphans. `activeCardWhere(_, true)` returns the membership-EXISTS form (the `false` fallback form is irrelevant here since orphan-counting is only meaningful for initialized users; callers pass an initialized user).

- [ ] **Step 4: Push and confirm pass** — CI green.

---

## Task 2: `app/groups/actions.ts` server-action wrappers

**Files:**
- Create: `app/groups/actions.ts`

These cannot be CI-tested (they import `@/lib/auth` → next-auth). They are thin and verified by `tsc` + reading + deploy. Each delegates to an already-tested lib function.

- [ ] **Step 1: Implement the wrappers**

Create `app/groups/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { GroupError } from "@/lib/group-actions";
import * as actions from "@/lib/group-actions";
import { duplicateGroup } from "@/lib/group-duplicate";

const MIN = 60 * 1000;

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user.id;
}

function limit(userId: string, name: string, max: number) {
  const rl = rateLimit({ key: `groups:${name}:${userId}`, limit: max, windowMs: MIN });
  if (!rl.ok) redirect("/groups?error=rate_limited");
}

function fail(e: unknown): never {
  if (e instanceof GroupError) redirect(`/groups?error=${e.code}`);
  throw e;
}

function revalidateAll() {
  revalidatePath("/groups");
  revalidatePath("/today");
  revalidatePath("/review");
}

export async function createGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "create", 20);
  const name = String(formData.get("name") ?? "");
  const description = formData.get("description") ? String(formData.get("description")) : undefined;
  let group;
  try {
    group = await actions.createGroup(userId, name, description);
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  redirect(`/groups/${group.id}`);
}

export async function renameGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const name = formData.get("name") ? String(formData.get("name")) : undefined;
  const description = formData.get("description") !== null ? String(formData.get("description")) : undefined;
  try {
    await actions.renameGroup(userId, groupId, { name, description });
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  try {
    await actions.deleteGroup(userId, groupId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  redirect("/groups");
}

export async function activateGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "activate", 60);
  const groupId = String(formData.get("groupId"));
  try {
    await actions.activateGroup(userId, groupId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
}

export async function deactivateGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  try {
    await actions.deactivateGroup(userId, groupId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
}

export async function addProblemToGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  try {
    await actions.addProblemToGroup(userId, groupId, problemId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  revalidatePath(`/groups/${groupId}`);
}

export async function removeProblemFromGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  try {
    await actions.removeProblemFromGroup(userId, groupId, problemId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  revalidatePath(`/groups/${groupId}`);
}

export async function createProblemInGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "author", 60);
  const groupId = String(formData.get("groupId"));
  try {
    await actions.createProblemInGroup(userId, groupId, {
      title: String(formData.get("title") ?? ""),
      prompt: String(formData.get("prompt") ?? ""),
      approach: String(formData.get("approach") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      url: formData.get("url") ? String(formData.get("url")) : undefined,
    });
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  redirect(`/groups/${groupId}`);
}

export async function editProblemAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  try {
    await actions.editProblem(userId, problemId, {
      title: String(formData.get("title") ?? ""),
      prompt: String(formData.get("prompt") ?? ""),
      approach: String(formData.get("approach") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      url: formData.get("url") ? String(formData.get("url")) : undefined,
    });
  } catch (e) {
    fail(e);
  }
  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}

export async function duplicateGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "duplicate", 20);
  const sourceGroupId = String(formData.get("sourceGroupId"));
  let copy;
  try {
    copy = await duplicateGroup(userId, sourceGroupId);
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  redirect(`/groups/${copy.id}?copied=1`);
}
```

- [ ] **Step 2: Push and confirm `tsc` passes** — `git add -A && git commit -m "feat: group server-action wrappers" && git push`; CI green (typecheck).

---

## Task 3: `/groups` list page + toggle

**Files:**
- Create: `app/groups/page.tsx`, `app/groups/GroupToggle.tsx`

Use **frontend-design:frontend-design** to render the brainstormed "sectioned single column" mock with the token vocabulary above.

- [ ] **Step 1: Build the toggle component**

Create `app/groups/GroupToggle.tsx` — a server-action form button that activates or deactivates. Contract:
- Props: `{ groupId: string; isActive: boolean }`.
- Renders a `<form action={isActive ? deactivateGroupAction : activateGroupAction}>` with a hidden `groupId` input and a submit button styled as a pill: active → `bg-accent text-accent-fg` "on ●"; inactive → `border border-border text-fg-3` "off ○".

```tsx
import { activateGroupAction, deactivateGroupAction } from "./actions";

export default function GroupToggle({ groupId, isActive }: { groupId: string; isActive: boolean }) {
  return (
    <form action={isActive ? deactivateGroupAction : activateGroupAction}>
      <input type="hidden" name="groupId" value={groupId} />
      <button
        type="submit"
        className={
          "h-8 rounded-lg px-3 text-xs font-medium transition-colors " +
          (isActive
            ? "bg-accent text-accent-fg hover:bg-accent-hover"
            : "border border-border bg-surface text-fg-3 hover:border-border-hi hover:text-fg")
        }
      >
        {isActive ? "on ●" : "off ○"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Build the list page**

Create `app/groups/page.tsx` (server component, `export const dynamic = "force-dynamic"`). Contract:
- `auth()` guard → `redirect("/signin")` if no session.
- `const view = await listGroupsView(userId)`.
- Header row: `label` "anki / srs · groups" + a back link to `/today`.
- Optional `?error=` banner (map `forbidden|not_found|invalid_problem|cap_exceeded|rate_limited` to short copy; reuse the warn-banner style from signup).
- **ACTIVE** section: each `view.active` row → name (link to `/groups/[id]`), `dueCount` (mono tabular) + "due", `<GroupToggle isActive />`.
- **YOUR GROUPS** section: each `view.owned` row → name link, problemCount, `<GroupToggle />`. A "+ New group" form (inline `name` input → `createGroupAction`).
- **BROWSE SHARED** section: each `view.sharedCatalog` row → name link + an **Activate** button (`activateGroupAction` form) + **Make my own copy** button (`duplicateGroupAction` form, only when `isSystem`).
- Footer: when `view.orphanedCount > 0`, a link "N cards in no active group →" to `/groups/orphans` (Task 5).
- Each section hidden when empty (except YOUR GROUPS, which always shows the create form).

- [ ] **Step 3: Push, `tsc` green, then deploy-verify** — commit + push; confirm CI typecheck passes; the user reviews the Railway preview of `/groups`.

---

## Task 4: `/groups/[id]` detail + authoring

**Files:**
- Create: `app/groups/[id]/page.tsx`, `app/groups/[id]/ProblemForm.tsx`

- [ ] **Step 1: Build the problem form (client component)**

Create `app/groups/[id]/ProblemForm.tsx`. Contract:
- `"use client"`. Props: `{ groupId: string; action: (fd: FormData) => void; problem?: { id; title; prompt; approach; tags; url } }`.
- Renders a `<form action={action}>` with hidden `groupId` (and hidden `problemId` when editing), text input `title`, textareas `prompt` + `approach` (mono, `bg-surface-2 border-border`), `tags` input (comma-separated), optional `url`. Submit button "Save card".
- Used for both create (no `problem`) and edit (prefilled `defaultValue`s).

- [ ] **Step 2: Build the detail page**

Create `app/groups/[id]/page.tsx` (server component, dynamic). Contract:
- `auth()` guard. `const detail = await groupDetailView(userId, id); if (!detail) notFound();`
- Header: group name + `?copied=1` success note ("Copied. Deactivate the original so you don't review cards twice?" with a deactivate button for the source — only render when `copied` and the source is known; v1 may show a generic "Copied ✓" and link back to /groups).
- **Owned group:** rename/description inline form (`renameGroupAction`); `<GroupToggle>` if it has cards; an "Add card" `ProblemForm` (→ `createProblemInGroupAction`); a problem list where each row shows title + tags, an **edit** link (owned problems → inline `ProblemForm` with `editProblemAction`; curated problems show a lock, read-only), and a **remove** button (`removeProblemFromGroupAction`); a "Study this group" link to `/groups/[id]/study` (only when `isActive`); a **Delete group** button (`deleteGroupAction`, with a `confirm`-style note "Your N cards and history are kept").
- **Shared/system group:** read-only problem list (titles), an **Activate** button, and **Make my own copy** (`duplicateGroupAction`) when `canDuplicate`.

- [ ] **Step 3: Push, `tsc` green, deploy-verify** the authoring + edit + duplicate flows on Railway.

---

## Task 5: Groups nav + orphaned-card view

**Files:**
- Modify: `app/today/page.tsx`
- Create: `app/groups/orphans/page.tsx`

- [ ] **Step 1: Add the Groups nav link**

In `app/today/page.tsx` header (the row with the email + Sign out), add a `Link href="/groups"` styled like the existing secondary header controls (`h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi`) labeled "Groups". Place it before the Sign out form.

- [ ] **Step 2: Build the orphaned-card list**

Create `app/groups/orphans/page.tsx` (server component, dynamic). Contract:
- `auth()` guard. Query the user's orphaned cards: `prisma.card.findMany({ where: { userId, NOT: activeCardWhere(userId, true) }, include: { problem: true } })`.
- Render each: problem title + tags, and an **"Add to a group"** control — a `<form action={addProblemToGroupAction}>` with hidden `problemId` and a `<select name="groupId">` listing the user's OWNED groups (from `prisma.group.findMany({ where: { ownerId: userId } })`). (Only owned groups accept additions.)
- Header link back to `/groups`. Empty state: "No orphaned cards — everything's in an active group."

- [ ] **Step 3: Push + deploy-verify.**

---

## Task 6: "Study this group" focus session

**Files:**
- Create: `app/groups/[id]/study/page.tsx`

- [ ] **Step 1: Build the focus page**

Create `app/groups/[id]/study/page.tsx` (server component, dynamic). Contract:
- `auth()` guard. `try { await assertActiveStudyableGroup(userId, id) } catch { redirect("/groups?error=forbidden") }`.
- Pick the next due card scoped to the group: `prisma.card.findFirst({ where: { ...focusGroupCardWhere(userId, id), dueAt: { lte: now } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], include: { problem: true } })`.
- If none, render a small "Nothing due in this group" panel with a link back to `/groups/[id]`.
- Else render the existing `ReviewCard` (`app/review/ReviewCard.tsx`) with the card — it already posts to `gradeCard` and advances. (gradeCard is unchanged and group-agnostic; grading from the focus view is correct.)
- Header: group name + a back link.

> Reuse note: `ReviewCard` takes a `card` prop with `{ id, problem, ... }`. Match the shape passed by `app/review/page.tsx`. If `ReviewCard` needs the page to re-fetch the next card after grade, the existing `revalidatePath("/review")` in `gradeCard` won't refresh this route — add `revalidatePath` is not possible from here; instead the focus page is `dynamic` and re-renders on navigation. For v1, after a grade the existing `ReviewCard` flow redirects per its current behavior; confirm on the deploy preview and, if the next card doesn't auto-advance within the group, file it as a follow-up (the daily pile remains the primary flow).

- [ ] **Step 2: Push, `tsc` green, deploy-verify** the focus session.

---

## Self-review checklist (completed during authoring)

- **Spec §3 coverage:** `/groups` sectioned list (active/owned/browse) + due counts + toggle ✓; orphaned-card counter + list with per-card add ✓; Browse Activate + "Make my own copy" (curated only) ✓; `/groups/[id]` owned (rename/add/author/edit/remove/delete) + shared (read-only/activate/duplicate) ✓; "Study this group" for active groups ✓; Groups nav ✓; post-duplicate prompt (v1: copied note) ✓.
- **CI-testable vs deploy-verified:** `lib/group-views.ts` is CI-tested (Task 1). Wrappers (Task 2) + pages (Tasks 3–6) are `tsc`-checked in CI and clicked through on a Railway deploy preview. This is called out per task.
- **Reuses tested backend:** every mutation goes through an already-tested lib function (`createGroup`, `activateGroup`, `duplicateGroup`, `createProblemInGroup`, `editProblem`, …); no new authorization logic in the UI layer. `groupDetailView`/`listGroupsView` are read-only and userId-scoped (tested).
- **Type consistency:** `GroupSummary`/`GroupsView`/`GroupDetail`/`ProblemRow` defined in Task 1 and consumed by Tasks 3–6. Action wrappers named `<verb>GroupAction` / `<verb>ProblemInGroupAction` consistently. `GroupError.code` → `?error=` mapping consistent.
- **Known v1 limitations (documented, not placeholders):** the post-duplicate "deactivate the original?" one-click prompt is simplified to a "Copied ✓" note + manual deactivate in v1 (full prompt is a fast-follow); the focus-session auto-advance-after-grade is confirmed on deploy and filed as a follow-up if `ReviewCard` doesn't re-fetch within the group route. Both are explicitly scoped, not hand-waved.
- **frontend-design:** Tasks 3–6 invoke the frontend-design skill to match the existing dark, mono, phosphor-green aesthetic rather than generic styling.
