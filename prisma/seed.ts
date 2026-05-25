import { PrismaClient } from "@prisma/client";
import { SEED_PROBLEMS } from "../lib/seed-data";

const prisma = new PrismaClient();

async function main() {
  // Upsert curated problems (idempotent).
  for (const p of SEED_PROBLEMS) {
    await prisma.problem.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        source: p.source,
        url: p.url,
        prompt: p.prompt,
        approach: p.approach,
        tags: p.tags,
      },
      create: p,
    });
  }

  // Remove problems whose slug is no longer in the curated list.
  // Cards and ReviewLog rows referencing these will cascade-delete (per schema).
  // Acceptable while the user base is small and pre-launch; revisit if review history matters.
  const keepSlugs = new Set(SEED_PROBLEMS.map((p) => p.slug));
  const stale = await prisma.problem.findMany({ select: { slug: true } });
  const toDelete = stale.filter((p) => !keepSlugs.has(p.slug)).map((p) => p.slug);
  if (toDelete.length > 0) {
    const result = await prisma.problem.deleteMany({ where: { slug: { in: toDelete } } });
    console.log(`Removed ${result.count} stale problems: ${toDelete.join(", ")}`);
  }

  const count = await prisma.problem.count();
  console.log(`Seeded. Problem count = ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
