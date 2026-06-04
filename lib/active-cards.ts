import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The single source of truth for "which of a user's cards are studyable today".
 * Server-only; derived purely from the authenticated userId. Never accepts a client groupId.
 *
 * groupsInitialized === false → fallback to all curated content (createdById: null),
 * reproducing pre-feature behavior for un-backfilled users. Once initialized, an empty
 * active set correctly yields an empty pile.
 */
export function activeCardWhere(userId: string, groupsInitialized: boolean): Prisma.CardWhereInput {
  if (!groupsInitialized) {
    return { userId, problem: { createdById: null } };
  }
  return {
    userId,
    problem: {
      groups: {
        some: {
          group: {
            activations: { some: { userId } },
            OR: [{ visibility: "SHARED" }, { ownerId: userId }],
          },
        },
      },
    },
  };
}

/** Does the user have at least one studyable card under the effective active set? */
export async function hasAnyActiveCard(userId: string, groupsInitialized: boolean): Promise<boolean> {
  const found = await prisma.card.findFirst({
    where: activeCardWhere(userId, groupsInitialized),
    select: { id: true },
  });
  return found !== null;
}
