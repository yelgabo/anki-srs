import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "./factory";

describe("db harness", () => {
  it("starts empty each test (truncation works)", async () => {
    expect(await prisma.user.count()).toBe(0);
    await makeUser();
    expect(await prisma.user.count()).toBe(1);
  });

  it("is isolated from the previous test", async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it("can create a curated problem and a group", async () => {
    const p = await makeProblem("two-sum", null);
    const g = await prisma.group.create({
      data: { key: "g1", ownerId: null, visibility: "SHARED", name: "G1" },
    });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    const count = await prisma.groupProblem.count({ where: { groupId: g.id } });
    expect(count).toBe(1);
  });
});
