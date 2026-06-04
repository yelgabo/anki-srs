import { randomUUID } from "node:crypto";
import type { Group, Problem, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureCards } from "@/lib/groups";

/** Abuse bound on owned groups per user. */
export const MAX_GROUPS_PER_USER = 100;
/** Abuse bound on authored problems per user. */
export const MAX_AUTHORED_PROBLEMS_PER_USER = 5000;

/** Typed failure for group/problem authorization + invariants. Action wrappers map `code` to HTTP/redirect. */
export class GroupError extends Error {
  constructor(
    public code: "forbidden" | "not_found" | "invalid_problem" | "cap_exceeded",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GroupError";
  }
}

// ───── Guards ─────

/** The group must exist AND be owned by the caller. System groups (ownerId null) never match. */
export async function assertOwnedGroup(userId: string, groupId: string): Promise<Group> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError("not_found");
  if (group.ownerId !== userId) throw new GroupError("forbidden");
  return group;
}

/** The problem must exist AND be authored by the caller. Curated (createdById null) is read-only. */
export async function assertOwnedProblem(userId: string, problemId: string): Promise<Problem> {
  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) throw new GroupError("not_found");
  if (problem.createdById === null || problem.createdById !== userId) throw new GroupError("forbidden");
  return problem;
}

/** The group must exist AND be studyable by the caller: SHARED, or owned by the caller. */
export async function assertStudyableGroup(userId: string, groupId: string): Promise<Group> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError("not_found");
  if (group.visibility !== "SHARED" && group.ownerId !== userId) throw new GroupError("forbidden");
  return group;
}

// ───── Helpers ─────

/** Is this group currently in the user's active set? */
export async function isGroupActive(userId: string, groupId: string): Promise<boolean> {
  const row = await prisma.groupActivation.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  return row !== null;
}

/** Problem ids attached to a group. */
export async function groupProblemIds(groupId: string): Promise<string[]> {
  const rows = await prisma.groupProblem.findMany({ where: { groupId }, select: { problemId: true } });
  return rows.map((r) => r.problemId);
}

// ───── Group actions ─────

export async function createGroup(userId: string, name: string, description?: string): Promise<Group> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new GroupError("invalid_problem", "name required");
  const count = await prisma.group.count({ where: { ownerId: userId } });
  if (count >= MAX_GROUPS_PER_USER) throw new GroupError("cap_exceeded");
  return prisma.group.create({
    data: { ownerId: userId, visibility: "PRIVATE", name: trimmed, description: description?.trim() || null },
  });
}

export async function renameGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; description?: string },
): Promise<Group> {
  await assertOwnedGroup(userId, groupId);
  const data: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length === 0) throw new GroupError("invalid_problem", "name required");
    data.name = trimmed;
  }
  if (patch.description !== undefined) data.description = patch.description.trim() || null;
  return prisma.group.update({ where: { id: groupId }, data });
}

export async function deleteGroup(userId: string, groupId: string): Promise<void> {
  await assertOwnedGroup(userId, groupId);
  // GroupProblem + GroupActivation cascade via schema onDelete; Card/ReviewLog are unaffected.
  await prisma.group.delete({ where: { id: groupId } });
}

export async function activateGroup(userId: string, groupId: string): Promise<void> {
  await assertStudyableGroup(userId, groupId);
  await prisma.groupActivation.createMany({ data: [{ userId, groupId }], skipDuplicates: true });
  const problemIds = await groupProblemIds(groupId);
  await ensureCards(userId, problemIds);
}

export async function deactivateGroup(userId: string, groupId: string): Promise<void> {
  await prisma.groupActivation.deleteMany({ where: { userId, groupId } });
}

// ───── Problem-in-group actions ─────

export async function addProblemToGroup(userId: string, groupId: string, problemId: string): Promise<void> {
  await assertOwnedGroup(userId, groupId);
  const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { createdById: true } });
  if (!problem) throw new GroupError("not_found");
  // Only curated (null) or the caller's own problems may be added.
  if (problem.createdById !== null && problem.createdById !== userId) {
    throw new GroupError("invalid_problem");
  }
  await prisma.groupProblem.createMany({ data: [{ groupId, problemId }], skipDuplicates: true });
  if (await isGroupActive(userId, groupId)) await ensureCards(userId, [problemId]);
}

export async function removeProblemFromGroup(userId: string, groupId: string, problemId: string): Promise<void> {
  await assertOwnedGroup(userId, groupId);
  await prisma.groupProblem.deleteMany({ where: { groupId, problemId } });
}

export interface NewProblemInput {
  title: string;
  prompt: string;
  approach: string;
  tags: string[];
  url?: string;
}

export async function createProblemInGroup(
  userId: string,
  groupId: string,
  input: NewProblemInput,
): Promise<Problem> {
  await assertOwnedGroup(userId, groupId);
  const title = input.title.trim();
  if (title.length === 0) throw new GroupError("invalid_problem", "title required");
  const count = await prisma.problem.count({ where: { createdById: userId } });
  if (count >= MAX_AUTHORED_PROBLEMS_PER_USER) throw new GroupError("cap_exceeded");

  const problem = await prisma.problem.create({
    data: {
      slug: randomUUID(), // opaque; never derived from title/userId
      createdById: userId,
      title,
      source: "custom",
      url: input.url?.trim() || null,
      prompt: input.prompt,
      approach: input.approach,
      tags: input.tags,
    },
  });
  await prisma.groupProblem.create({ data: { groupId, problemId: problem.id } });
  if (await isGroupActive(userId, groupId)) await ensureCards(userId, [problem.id]);
  return problem;
}

export interface EditProblemInput {
  title?: string;
  prompt?: string;
  approach?: string;
  tags?: string[];
  url?: string;
}

export async function editProblem(userId: string, problemId: string, patch: EditProblemInput): Promise<Problem> {
  await assertOwnedProblem(userId, problemId);
  const data: { title?: string; prompt?: string; approach?: string; tags?: string[]; url?: string | null } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length === 0) throw new GroupError("invalid_problem", "title required");
    data.title = t;
  }
  if (patch.prompt !== undefined) data.prompt = patch.prompt;
  if (patch.approach !== undefined) data.approach = patch.approach;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.url !== undefined) data.url = patch.url.trim() || null;
  return prisma.problem.update({ where: { id: problemId }, data });
}

// ───── Focus session (study one group) ─────

/** Guard for the per-group focus session: the group must be studyable AND currently active for the user. */
export async function assertActiveStudyableGroup(userId: string, groupId: string): Promise<void> {
  await assertStudyableGroup(userId, groupId);
  if (!(await isGroupActive(userId, groupId))) {
    throw new GroupError("forbidden", "group is not active");
  }
}

/** Cards belonging to the user whose problem is in exactly this one group. userId-scoped. */
export function focusGroupCardWhere(userId: string, groupId: string): Prisma.CardWhereInput {
  return { userId, problem: { groups: { some: { groupId } } } };
}
