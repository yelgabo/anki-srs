"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { schedule, type Grade } from "@/lib/srs";

const GradeSchema = z.object({
  cardId: z.string().min(1),
  grade: z.number().int().min(0).max(3),
});

export async function gradeCard(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const parsed = GradeSchema.safeParse({
    cardId: formData.get("cardId"),
    grade: Number(formData.get("grade")),
  });
  if (!parsed.success) throw new Error("Invalid grade input");

  const { cardId, grade } = parsed.data;

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== session.user.id) throw new Error("Card not found");

  const next = schedule(
    { ease: card.ease, intervalDays: card.intervalDays, reps: card.reps, lapses: card.lapses },
    grade as Grade,
  );

  await prisma.$transaction([
    prisma.card.update({
      where: { id: card.id },
      data: {
        ease: next.ease,
        intervalDays: next.intervalDays,
        reps: next.reps,
        lapses: next.lapses,
        dueAt: next.dueAt,
        lastReviewedAt: next.lastReviewedAt,
      },
    }),
    prisma.reviewLog.create({
      data: {
        cardId: card.id,
        userId: session.user.id,
        grade,
        prevInterval: card.intervalDays,
        newInterval: next.intervalDays,
        prevEase: card.ease,
        newEase: next.ease,
      },
    }),
  ]);

  revalidatePath("/review");
}

// Lazy provisioning: ensure the signed-in user has a Card for every Problem.
// Run inline from the review page on each visit — cheap enough for a few dozen problems.
export async function ensureCards(userId: string): Promise<void> {
  const problemIds = (await prisma.problem.findMany({ select: { id: true } })).map((p) => p.id);
  if (problemIds.length === 0) return;

  const existing = new Set(
    (
      await prisma.card.findMany({
        where: { userId, problemId: { in: problemIds } },
        select: { problemId: true },
      })
    ).map((c) => c.problemId),
  );

  const missing = problemIds.filter((id) => !existing.has(id));
  if (missing.length === 0) return;

  await prisma.card.createMany({
    data: missing.map((problemId) => ({ userId, problemId })),
    skipDuplicates: true,
  });
}
