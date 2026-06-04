import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { makeUser, makeProblem } from "@/test/db/factory";
import { listGroupsView, groupDetailView } from "./group-views";

const PAST = new Date("2020-01-01T00:00:00Z");

describe("listGroupsView", () => {
  it("partitions active / owned / shared-catalog and counts due cards", async () => {
    const u = await makeUser({ groupsInitialized: true });
    // Owned + active group with one due card.
    const active = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "Active" } });
    const p = await makeProblem("p", u.id);
    await prisma.groupProblem.create({ data: { groupId: active.id, problemId: p.id } });
    await prisma.card.create({ data: { userId: u.id, problemId: p.id, dueAt: PAST } });
    await prisma.groupActivation.create({ data: { userId: u.id, groupId: active.id } });
    // Owned, not active.
    await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "Owned" } });
    // Shared system catalog, not owned/active.
    await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Catalog" } });

    const view = await listGroupsView(u.id);

    expect(view.active.map((g) => g.name)).toEqual(["Active"]);
    expect(view.active[0].dueCount).toBe(1);
    expect(view.active[0].isActive).toBe(true);
    expect(view.owned.map((g) => g.name)).toEqual(["Owned"]);
    expect(view.sharedCatalog.map((g) => g.name)).toEqual(["Catalog"]);
  });

  it("counts orphaned cards (user cards in no active group)", async () => {
    const u = await makeUser({ groupsInitialized: true });
    const orphan = await makeProblem("orphan", u.id);
    await prisma.card.create({ data: { userId: u.id, problemId: orphan.id } }); // in no group
    const view = await listGroupsView(u.id);
    expect(view.orphanedCount).toBe(1);
  });

  it("does not list another user's private groups", async () => {
    const a = await makeUser();
    const b = await makeUser({ groupsInitialized: true });
    await prisma.group.create({ data: { ownerId: a.id, visibility: "PRIVATE", name: "A-private" } });
    const view = await listGroupsView(b.id);
    expect([...view.active, ...view.owned, ...view.sharedCatalog].some((g) => g.name === "A-private")).toBe(false);
  });
});

describe("groupDetailView", () => {
  it("returns an owned group with its problems and ownership flags", async () => {
    const u = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: u.id, visibility: "PRIVATE", name: "G" } });
    const mine = await makeProblem("mine", u.id);
    const curated = await makeProblem("curated", null);
    await prisma.groupProblem.createMany({
      data: [{ groupId: g.id, problemId: mine.id }, { groupId: g.id, problemId: curated.id }],
    });

    const detail = await groupDetailView(u.id, g.id);
    expect(detail).not.toBeNull();
    expect(detail!.isOwned).toBe(true);
    expect(detail!.canDuplicate).toBe(false);
    const byTitle = Object.fromEntries(detail!.problems.map((p) => [p.title, p.isOwned]));
    expect(byTitle["mine"]).toBe(true);
    expect(byTitle["curated"]).toBe(false);
  });

  it("returns a shared system group as duplicatable, read-only", async () => {
    const u = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: null, visibility: "SHARED", name: "Sys" } });
    const detail = await groupDetailView(u.id, g.id);
    expect(detail!.isOwned).toBe(false);
    expect(detail!.canDuplicate).toBe(true);
  });

  it("returns null for another user's private group (no access)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await prisma.group.create({ data: { ownerId: a.id, visibility: "PRIVATE", name: "A" } });
    expect(await groupDetailView(b.id, g.id)).toBeNull();
  });
});
