import { prisma } from "@/lib/db";

let n = 0;
export async function makeUser(overrides: { groupsInitialized?: boolean } = {}) {
  n += 1;
  return prisma.user.create({
    data: {
      email: `u${n}-${process.pid}@test.local`,
      passwordHash: "x",
      groupsInitialized: overrides.groupsInitialized ?? false,
    },
  });
}

export async function makeProblem(slug: string, createdById: string | null = null) {
  return prisma.problem.create({
    data: {
      slug,
      createdById,
      title: slug,
      source: "test",
      prompt: `prompt ${slug}`,
      approach: `approach ${slug}`,
      tags: [],
    },
  });
}
