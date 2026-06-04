import { randomUUID } from "node:crypto";
import type { Group } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GroupError, MAX_GROUPS_PER_USER, MAX_AUTHORED_PROBLEMS_PER_USER } from "@/lib/group-actions";

/** "<base> (copy)", then "(copy 2)", "(copy 3)" … unique among the user's owned groups. */
async function disambiguatedCopyName(userId: string, base: string): Promise<string> {
  const existing = await prisma.group.findMany({
    where: { ownerId: userId, name: { startsWith: `${base} (copy` } },
    select: { name: true },
  });
  const taken = new Set(existing.map((g) => g.name));
  if (!taken.has(`${base} (copy)`)) return `${base} (copy)`;
  let n = 2;
  while (taken.has(`${base} (copy ${n})`)) n += 1;
  return `${base} (copy ${n})`;
}

/**
 * Deep-copy a system-curated SHARED group into a PRIVATE owned group: new owned Problem
 * rows (opaque slugs), GroupProblem links, and Cards that carry over the user's SM-2 state
 * from the source curated card when present. Source group/problems/cards are untouched.
 * The copy is created INACTIVE; the user activates it explicitly. Curated-only by design.
 */
export async function duplicateGroup(userId: string, sourceGroupId: string): Promise<Group> {
  const source = await prisma.group.findUnique({ where: { id: sourceGroupId } });
  if (!source) throw new GroupError("not_found");
  if (source.ownerId !== null || source.visibility !== "SHARED") throw new GroupError("forbidden");

  if ((await prisma.group.count({ where: { ownerId: userId } })) >= MAX_GROUPS_PER_USER) {
    throw new GroupError("cap_exceeded");
  }

  const members = await prisma.groupProblem.findMany({
    where: { groupId: sourceGroupId },
    select: { problem: true },
  });
  const sourceProblems = members.map((m) => m.problem);

  if (
    (await prisma.problem.count({ where: { createdById: userId } })) + sourceProblems.length >
    MAX_AUTHORED_PROBLEMS_PER_USER
  ) {
    throw new GroupError("cap_exceeded");
  }

  // The user's existing SM-2 state on the source problems, to carry over.
  const priorCards = await prisma.card.findMany({
    where: { userId, problemId: { in: sourceProblems.map((p) => p.id) } },
  });
  const priorBySource = new Map(priorCards.map((c) => [c.problemId, c]));

  const name = await disambiguatedCopyName(userId, source.name);

  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        ownerId: userId,
        visibility: "PRIVATE",
        sourceGroupId: source.id,
        name,
        description: source.description,
      },
    });
    for (const sp of sourceProblems) {
      const np = await tx.problem.create({
        data: {
          slug: randomUUID(),
          createdById: userId,
          title: sp.title,
          source: sp.source,
          url: sp.url,
          prompt: sp.prompt,
          approach: sp.approach,
          tags: sp.tags,
        },
      });
      await tx.groupProblem.create({ data: { groupId: group.id, problemId: np.id } });
      const prior = priorBySource.get(sp.id);
      await tx.card.create({
        data: {
          userId,
          problemId: np.id,
          // Carry over SM-2 when the user already studied the source; else schema defaults.
          ease: prior?.ease,
          intervalDays: prior?.intervalDays,
          reps: prior?.reps,
          lapses: prior?.lapses,
          dueAt: prior?.dueAt,
          lastReviewedAt: prior?.lastReviewedAt,
          leech: prior?.leech,
        },
      });
    }
    return group;
  });
}
