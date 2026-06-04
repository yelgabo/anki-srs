import { prisma } from "@/lib/db";
import { activeCardWhere } from "@/lib/active-cards";
import { focusGroupCardWhere } from "@/lib/group-actions";

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "SHARED";
  isOwned: boolean;
  isSystem: boolean;
  isActive: boolean;
  problemCount: number;
  dueCount: number;
}

export interface GroupsView {
  active: GroupSummary[];
  owned: GroupSummary[];
  sharedCatalog: GroupSummary[];
  orphanedCount: number;
}

export async function listGroupsView(userId: string): Promise<GroupsView> {
  const activations = await prisma.groupActivation.findMany({ where: { userId }, select: { groupId: true } });
  const activeIds = new Set(activations.map((a) => a.groupId));

  // Visible groups: owned by the user, OR activated, OR shared.
  const groups = await prisma.group.findMany({
    where: { OR: [{ ownerId: userId }, { id: { in: [...activeIds] } }, { visibility: "SHARED" }] },
    orderBy: [{ ownerId: "asc" }, { name: "asc" }],
  });

  const now = new Date();
  const summaries: GroupSummary[] = [];
  for (const g of groups) {
    const isActive = activeIds.has(g.id);
    const problemCount = await prisma.groupProblem.count({ where: { groupId: g.id } });
    const dueCount = isActive
      ? await prisma.card.count({ where: { ...focusGroupCardWhere(userId, g.id), dueAt: { lte: now } } })
      : 0;
    summaries.push({
      id: g.id,
      name: g.name,
      description: g.description,
      visibility: g.visibility,
      isOwned: g.ownerId === userId,
      isSystem: g.ownerId === null,
      isActive,
      problemCount,
      dueCount,
    });
  }

  const orphanedCount = await prisma.card.count({
    where: { userId, NOT: activeCardWhere(userId, true) },
  });

  return {
    active: summaries.filter((s) => s.isActive),
    owned: summaries.filter((s) => !s.isActive && s.isOwned),
    sharedCatalog: summaries.filter((s) => !s.isActive && !s.isOwned && s.visibility === "SHARED"),
    orphanedCount,
  };
}

export interface ProblemRow {
  id: string;
  title: string;
  tags: string[];
  isOwned: boolean;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "SHARED";
  isOwned: boolean;
  isSystem: boolean;
  isActive: boolean;
  canDuplicate: boolean;
  problems: ProblemRow[];
}

/** null when the group does not exist or the user may neither own nor study it. */
export async function groupDetailView(userId: string, groupId: string): Promise<GroupDetail | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { problems: { include: { problem: true }, orderBy: { addedAt: "asc" } } },
  });
  if (!group) return null;
  const isOwned = group.ownerId === userId;
  const visible = isOwned || group.visibility === "SHARED";
  if (!visible) return null;

  const isActive = (await prisma.groupActivation.count({ where: { userId, groupId } })) > 0;

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    visibility: group.visibility,
    isOwned,
    isSystem: group.ownerId === null,
    isActive,
    canDuplicate: group.ownerId === null && group.visibility === "SHARED",
    problems: group.problems.map((gp) => ({
      id: gp.problem.id,
      title: gp.problem.title,
      tags: gp.problem.tags,
      isOwned: gp.problem.createdById === userId,
    })),
  };
}
