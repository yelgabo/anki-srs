import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { ensureCards, createUserWithDefaultGroup, SYSTEM_GROUP_KEY } from "./groups";
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
