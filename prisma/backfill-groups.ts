import { prisma } from "../lib/db";
import { SYSTEM_GROUP_KEY, ensureCards } from "../lib/groups";

export async function backfillGroups() {
  const group = await prisma.group.findUnique({
    where: { key: SYSTEM_GROUP_KEY },
    select: { id: true, problems: { select: { problemId: true } } },
  });
  if (!group) throw new Error("System group not seeded — run db:seed first");
  const problemIds = group.problems.map((p) => p.problemId);

  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id: userId } of users) {
    await prisma.groupActivation.createMany({
      data: [{ userId, groupId: group.id }],
      skipDuplicates: true,
    });
    await ensureCards(userId, problemIds);
    await prisma.user.update({ where: { id: userId }, data: { groupsInitialized: true } });
  }

  // Deploy checklist assertion: every user has every system-group card.
  let usersMissingCards = 0;
  for (const { id: userId } of users) {
    const have = await prisma.card.count({ where: { userId, problemId: { in: problemIds } } });
    if (have < problemIds.length) usersMissingCards += 1;
  }
  const report = { users: users.length, problems: problemIds.length, usersMissingCards };
  console.log("Backfill report:", report);
  return report;
}

if (require.main === module) {
  backfillGroups()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
