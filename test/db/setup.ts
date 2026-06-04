import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

// Truncate all domain + auth tables before each test. RESTART IDENTITY + CASCADE
// keeps it order-independent. _prisma_migrations is absent (db push), so we list tables dynamically.
beforeEach(async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
