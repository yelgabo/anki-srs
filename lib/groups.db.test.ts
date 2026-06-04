import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { ensureCards } from "./groups";
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
