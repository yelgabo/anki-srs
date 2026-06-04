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

/**
 * Create a user and, if the system group exists, activate it + materialize its
 * cards + set groupsInitialized — all in one transaction. signIn is NOT called here
 * (it re-queries the DB and throws NEXT_REDIRECT; it cannot live in a transaction).
 * A missing system group is tolerated: the user is created with the flag false, and
 * the activeCardWhere fallback yields the curated pile.
 *
 * Lives in lib (not the signup server-action file) so it stays free of next-auth /
 * next/headers imports and remains unit-testable under vitest.
 */
export async function createUserWithDefaultGroup(email: string, passwordHash: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash } });
    const group = await tx.group.findUnique({
      where: { key: SYSTEM_GROUP_KEY },
      select: { id: true, problems: { select: { problemId: true } } },
    });
    if (group) {
      await tx.groupActivation.create({ data: { userId: user.id, groupId: group.id } });
      await tx.card.createMany({
        data: group.problems.map((p) => ({ userId: user.id, problemId: p.problemId })),
        skipDuplicates: true,
      });
      await tx.user.update({ where: { id: user.id }, data: { groupsInitialized: true } });
    }
    return user;
  });
}
