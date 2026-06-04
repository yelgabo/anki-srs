import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { ensureCards, createUserWithDefaultGroup, selfHealActiveCards, SYSTEM_GROUP_KEY } from "./groups";
import { seedDatabase } from "@/prisma/seed";
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
    const u = await createUserWithDefaultGroup("nogroup@test.local", "hash");
    expect(await prisma.groupActivation.count({ where: { userId: u.id } })).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))!.groupsInitialized).toBe(false);
  });
});

describe("selfHealActiveCards", () => {
  it("creates cards for active-group problems the user is missing", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });
    // A problem added to the active group AFTER activation, with no card yet.
    const p = await makeProblem("late-add");
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(0);

    await selfHealActiveCards(u.id, true);

    expect(await prisma.card.count({ where: { userId: u.id, problemId: p.id } })).toBe(1);
  });

  it("is a no-op for uninitialized (fallback) users", async () => {
    const u = await makeUser({ groupsInitialized: false });
    await selfHealActiveCards(u.id, false);
    expect(await prisma.card.count({ where: { userId: u.id } })).toBe(0);
  });

  it("does not heal cards for another user's group", async () => {
    const owner = await makeUser({ groupsInitialized: true });
    const other = await makeUser({ groupsInitialized: true });
    const g = await prisma.group.create({ data: { ownerId: owner.id, visibility: "PRIVATE", name: "G" } });
    await prisma.groupActivation.create({ data: { userId: owner.id, groupId: g.id } });
    const p = await makeProblem("owned");
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });

    await selfHealActiveCards(other.id, true);

    expect(await prisma.card.count({ where: { userId: other.id } })).toBe(0);
  });
});
