import { prisma } from "@/lib/db";

export const SYSTEM_GROUP_KEY = "neetcode-150";

/**
 * Materialize SM-2 cards for a user across exactly the given problems.
 * Idempotent: relies on Card @@unique([userId, problemId]) + skipDuplicates.
 * Replaces the old global ensureCards that created a card for EVERY problem.
 */
export async function ensureCards(userId: string, problemIds: string[]): Promise<void> {
  if (problemIds.length === 0) return;
  await prisma.card.createMany({
    data: problemIds.map((problemId) => ({ userId, problemId })),
    skipDuplicates: true,
  });
}

/** Problem ids attached to the default-active system group (NeetCode 150). */
export async function defaultActivationProblemIds(): Promise<string[]> {
  const group = await prisma.group.findUnique({
    where: { key: SYSTEM_GROUP_KEY },
    select: { problems: { select: { problemId: true } } },
  });
  return group?.problems.map((gp) => gp.problemId) ?? [];
}
