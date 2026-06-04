import { PrismaClient } from "@prisma/client";
import { SEED_PROBLEMS } from "../lib/seed-data";
import { SYSTEM_GROUP_KEY } from "../lib/groups";

const prisma = new PrismaClient();

export async function seedDatabase() {
  // 1. Upsert curated problems by the composite unique (createdById=null, slug).
  for (const p of SEED_PROBLEMS) {
    await prisma.problem.upsert({
      where: { createdById_slug: { createdById: null, slug: p.slug } },
      update: { title: p.title, source: p.source, url: p.url, prompt: p.prompt, approach: p.approach, tags: p.tags },
      create: { ...p, createdById: null },
    });
  }

  // 2. Stale-delete curated problems only — never touch user-authored ones.
  const keepSlugs = SEED_PROBLEMS.map((p) => p.slug);
  const removed = await prisma.problem.deleteMany({
    where: { createdById: null, slug: { notIn: keepSlugs } },
  });
  if (removed.count > 0) console.log(`Removed ${removed.count} stale curated problems`);

  // 3. Upsert the system group by key.
  const group = await prisma.group.upsert({
    where: { key: SYSTEM_GROUP_KEY },
    update: { name: "NeetCode 150", visibility: "SHARED", ownerId: null },
    create: { key: SYSTEM_GROUP_KEY, name: "NeetCode 150", visibility: "SHARED", ownerId: null },
  });

  // 4. Attach every curated problem to the group (idempotent).
  const curated = await prisma.problem.findMany({ where: { createdById: null }, select: { id: true } });
  await prisma.groupProblem.createMany({
    data: curated.map((p) => ({ groupId: group.id, problemId: p.id })),
    skipDuplicates: true,
  });

  // 5. Re-ensure cards for everyone already activated on the system group,
  //    so problems added after their activation still materialize.
  const activations = await prisma.groupActivation.findMany({
    where: { groupId: group.id },
    select: { userId: true },
  });
  if (activations.length > 0) {
    const problemIds = curated.map((p) => p.id);
    for (const { userId } of activations) {
      await prisma.card.createMany({
        data: problemIds.map((problemId) => ({ userId, problemId })),
        skipDuplicates: true,
      });
    }
  }

  const count = await prisma.problem.count();
  console.log(`Seeded. Problem count = ${count}`);
  return group;
}

// CLI entrypoint (npm run db:seed).
if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
