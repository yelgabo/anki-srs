import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { activeCardWhere } from "@/lib/active-cards";

const PAST = new Date("2020-01-01T00:00:00Z");

describe("review queue scoping", () => {
  it("a due card NOT in an active group is excluded", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const p = await makeProblem("orphan");
    await prisma.card.create({ data: { userId: u.id, problemId: p.id, dueAt: PAST } });

    const due = await prisma.card.findFirst({
      where: { ...activeCardWhere(u.id, true), dueAt: { lte: new Date() } },
    });
    expect(due).toBeNull();
  });

  it("a due card in an active group is included", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const p = await makeProblem("studied");
    await prisma.card.create({ data: { userId: u.id, problemId: p.id, dueAt: PAST } });
    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });

    const due = await prisma.card.findFirst({
      where: { ...activeCardWhere(u.id, true), dueAt: { lte: new Date() } },
    });
    expect(due?.problemId).toBe(p.id);
  });
});
