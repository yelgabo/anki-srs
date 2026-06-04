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
