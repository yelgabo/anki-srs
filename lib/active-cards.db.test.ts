import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { activeCardWhere, hasAnyActiveCard } from "./active-cards";

async function cardFor(userId: string, problemId: string) {
  await prisma.card.create({ data: { userId, problemId } });
}

describe("activeCardWhere", () => {
  it("returns only cards whose problem is in an ACTIVE group", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const inGroup = await makeProblem("in");
    const notInGroup = await makeProblem("out");
    await cardFor(u.id, inGroup.id);
    await cardFor(u.id, notInGroup.id);

    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: inGroup.id } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: g.id } });

    const cards = await prisma.card.findMany({ where: activeCardWhere(u.id, true) });
    expect(cards.map((c) => c.problemId)).toEqual([inGroup.id]);
  });

  it("never leaks another user's or a non-activated group's cards", async () => {
    const a = await makeUser({ groupsInitialized: true });
    const b = await makeUser({ groupsInitialized: true });
    const p = await makeProblem("shared");
    await cardFor(a.id, p.id);
    await cardFor(b.id, p.id);
    const g = await prisma.group.create({ data: { ownerId: b.id, visibility: "PRIVATE", name: "B" } });
    await prisma.groupProblem.create({ data: { groupId: g.id, problemId: p.id } });
    await prisma.groupActivation.create({ data: { userId: b.id, groupId: g.id } });

    expect(await prisma.card.findMany({ where: activeCardWhere(a.id, true) })).toHaveLength(0);
  });

  it("falls back to all curated cards when groupsInitialized is false", async () => {
    const u = await makeUser({ groupsInitialized: false });
    const curated = await makeProblem("curated", null);
    const authored = await makeProblem("authored", u.id);
    await cardFor(u.id, curated.id);
    await cardFor(u.id, authored.id);

    const cards = await prisma.card.findMany({ where: activeCardWhere(u.id, false) });
    expect(cards.map((c) => c.problemId)).toEqual([curated.id]);
  });

  it("initialized user with zero active groups sees nothing (not the fallback)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const curated = await makeProblem("c", null);
    await cardFor(u.id, curated.id);
    expect(await hasAnyActiveCard(u.id, true)).toBe(false);
    expect(await prisma.card.findMany({ where: activeCardWhere(u.id, true) })).toHaveLength(0);
  });
});
