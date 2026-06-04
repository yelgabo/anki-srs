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
    await seedDatabase();
    expect(await prisma.problem.count({ where: { slug: "my-own", createdById: u.id } })).toBe(1);
  });
});
