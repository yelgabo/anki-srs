import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { MAX_GROUPS_PER_USER, MAX_AUTHORED_PROBLEMS_PER_USER } from "./group-actions";
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
    const curatedIds = (
      await prisma.problem.findMany({ where: { createdById: null }, select: { id: true } })
    ).map((p) => p.id);
    expect(members.every((m) => !curatedIds.includes(m.problemId))).toBe(true);
  });

  it("leaves the source group, its problems, and the user's source cards untouched", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await curatedGroup("Src", ["a", "b"]);
    const before = await prisma.problem.count({ where: { createdById: null } });

    await duplicateGroup(u.id, src.id);

    expect(await prisma.groupProblem.count({ where: { groupId: src.id } })).toBe(2);
    expect(await prisma.problem.count({ where: { createdById: null } })).toBe(before);
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
    const srcCard = await prisma.card.findUnique({
      where: { userId_problemId: { userId: u.id, problemId: p.id } },
    });
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

  it("copies an empty curated group (no problems, no cards)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const src = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Empty" } });
    const copy = await duplicateGroup(u.id, src.id);
    expect(copy.ownerId).toBe(u.id);
    expect(await prisma.groupProblem.count({ where: { groupId: copy.id } })).toBe(0);
  });

  it("rejects when the user is at the owned-group cap", async () => {
    const u = await makeUser();
    const src = await curatedGroup("S", ["a"]);
    await prisma.group.createMany({
      data: Array.from({ length: MAX_GROUPS_PER_USER }, (_, i) => ({
        ownerId: u.id,
        visibility: "PRIVATE" as const,
        name: `g${i}`,
      })),
    });
    await expect(duplicateGroup(u.id, src.id)).rejects.toMatchObject({ code: "cap_exceeded" });
  });

  it("rejects when the copy would exceed the authored-problem cap", async () => {
    const u = await makeUser();
    const src = await curatedGroup("S", ["a"]); // would add 1 problem
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
    await expect(duplicateGroup(u.id, src.id)).rejects.toMatchObject({ code: "cap_exceeded" });
  });
});
