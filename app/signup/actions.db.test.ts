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
    const u = await createUserWithDefaultGroup("nogroup@test.local", "hash");
    expect(await prisma.groupActivation.count({ where: { userId: u.id } })).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))!.groupsInitialized).toBe(false);
  });
});
