import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import {
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

async function ownedGroup(userId: string, name = "G") {
  return prisma.group.create({ data: { ownerId: userId, visibility: "PRIVATE", name } });
}

// ───── Guards ─────

describe("assertOwnedGroup", () => {
  it("returns the group when the caller owns it", async () => {
    const u = await makeUser();
    const g = await ownedGroup(u.id);
    expect((await assertOwnedGroup(u.id, g.id)).id).toBe(g.id);
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

// ───── createGroup / renameGroup / deleteGroup ─────

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
    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("refuses to delete a system group", async () => {
    const u = await makeUser();
    const sys = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Sys" } });
    await expect(deleteGroup(u.id, sys.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

// ───── activateGroup / deactivateGroup ─────

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

// ───── addProblemToGroup / removeProblemFromGroup ─────

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

// ───── createProblemInGroup / editProblem ─────

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
    expect(p.slug.length).toBeGreaterThan(10);
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
