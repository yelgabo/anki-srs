import { PrismaClient } from "@prisma/client";
import { SEED_PROBLEMS } from "../lib/seed-data";

const prisma = new PrismaClient();

async function main() {
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
  const count = await prisma.problem.count();
  console.log(`Seeded. Problem count = ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
