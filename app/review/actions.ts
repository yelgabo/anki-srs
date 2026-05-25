"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { schedule, type Grade } from "@/lib/srs";
import { rateLimit } from "@/lib/rate-limit";
import {
  dayKey,
  parseDayKey,
  daysBetween,
  startOfMonth,
  addDays,
} from "@/lib/timezone";
import { sign, verify, type SkipPayload } from "@/lib/signed-cookie";

const GradeSchema = z.object({
  cardId: z.string().min(1),
  grade: z.number().int().min(0).max(3),
});

const SKIP_COOKIE = "m2_skip";
const MAX_SKIPS = 32;
const ONE_MINUTE = 60 * 1000;

// ----- gradeCard (rewrite per M2 spec) -----

export async function gradeCard(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  // Rate-limit: 120 grades/min/user
  const rl = rateLimit({ key: `grade:user:${userId}`, limit: 120, windowMs: ONE_MINUTE });
  if (!rl.ok) redirect("/review?error=rate_limited");

  const parsed = GradeSchema.safeParse({
    cardId: formData.get("cardId"),
    grade: Number(formData.get("grade")),
  });
  if (!parsed.success) throw new Error("Invalid grade input");

  const { cardId, grade } = parsed.data;

  // Verify ownership before opening the transaction.
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== userId) throw new Error("Card not found");

  // Compute the SM-2 update outside the transaction (pure).
  const next = schedule(
    {
      ease: card.ease,
      intervalDays: card.intervalDays,
      reps: card.reps,
      lapses: card.lapses,
    },
    grade as Grade,
    { cardId: card.id },
  );

  // Load user for timezone.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const tz = user.timezone;
  const now = next.lastReviewedAt;
  const today = dayKey(now, tz);

  await prisma.$transaction(async (tx) => {
    // Serialize freeze grants for this user. Postgres-only; SQLite silently ignores.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    // Determine the user's most recent active day from BOTH reviews and freezes.
    type LastDayRow = { d: Date | null };
    const lastActiveRows = await tx.$queryRaw<LastDayRow[]>`
      SELECT MAX(d) AS d FROM (
        SELECT (date_trunc('day', "reviewedAt" AT TIME ZONE ${tz}))::date AS d
          FROM "ReviewLog" WHERE "userId" = ${userId}
        UNION ALL
        SELECT "usedOn" AS d FROM "StreakFreeze" WHERE "userId" = ${userId}
      ) AS x
    `;
    const lastActive = lastActiveRows[0]?.d
      ? lastActiveRows[0].d.toISOString().slice(0, 10)
      : null;

    // If there's a gap between yesterday and lastActive, grant freezes (up to budget).
    if (lastActive) {
      const yesterday = addDays(today, -1);
      if (lastActive < yesterday) {
        // Determine missed days: (lastActive, today)
        const missed = daysBetween(lastActive, addDays(today, -1));
        if (missed.length > 0) {
          const monthStart = parseDayKey(startOfMonth(now, tz));
          const monthEnd = parseDayKey(startOfMonth(parseDayKey(addDays(today, 32)), tz));
          const used = await tx.streakFreeze.count({
            where: { userId, usedOn: { gte: monthStart, lt: monthEnd } },
          });
          const available = Math.max(0, 2 - used);
          for (const missedDay of missed.slice(0, available)) {
            await tx.streakFreeze.upsert({
              where: { userId_usedOn: { userId, usedOn: parseDayKey(missedDay) } },
              create: { userId, usedOn: parseDayKey(missedDay) },
              update: {},
            });
          }
        }
      }
    }

    // Apply the grade.
    await tx.card.update({
      where: { id: card.id },
      data: {
        ease: next.ease,
        intervalDays: next.intervalDays,
        reps: next.reps,
        lapses: next.lapses,
        dueAt: next.dueAt,
        lastReviewedAt: next.lastReviewedAt,
        leech: next.lapses >= 8,
      },
    });

    await tx.reviewLog.create({
      data: {
        cardId: card.id,
        userId,
        grade,
        prevInterval: card.intervalDays,
        newInterval: next.intervalDays,
        prevEase: card.ease,
        newEase: next.ease,
        prevReps: card.reps,
        prevLapses: card.lapses,
        prevLastReviewedAt: card.lastReviewedAt,
      },
    });
  });

  revalidatePath("/review");
  revalidatePath("/today");
}

// ----- skipAction -----

const SkipSchema = z.object({ cardId: z.string().min(1) });

export async function skipAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const parsed = SkipSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) throw new Error("Invalid skip input");
  const { cardId } = parsed.data;

  const jar = await cookies();
  const existing = verify(jar.get(SKIP_COOKIE)?.value);
  const ids =
    existing && existing.userId === userId ? [...existing.ids] : [];

  if (!ids.includes(cardId)) {
    ids.push(cardId);
    if (ids.length > MAX_SKIPS) ids.splice(0, ids.length - MAX_SKIPS);
  }

  const payload: SkipPayload = { userId, ids, iat: Date.now() };
  jar.set(SKIP_COOKIE, sign(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  revalidatePath("/review");
}

// ----- undoAction -----

export async function undoAction() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  // Rate-limit: 30 undos/min/user
  const rl = rateLimit({ key: `undo:user:${userId}`, limit: 30, windowMs: ONE_MINUTE });
  if (!rl.ok) redirect("/review?error=rate_limited");

  const thirtySecAgo = new Date(Date.now() - 30 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    const row = await tx.reviewLog.findFirst({
      where: { userId, reviewedAt: { gt: thirtySecAgo } },
      orderBy: { reviewedAt: "desc" },
    });
    if (!row) {
      redirect("/review?error=cant_undo");
      return;
    }

    // Recompute Card.dueAt from prevLastReviewedAt + prevInterval if we have it,
    // else best-effort: use current time minus the interval.
    const DAY_MS = 86_400_000;
    const baseDueAt = row.prevLastReviewedAt
      ? new Date(row.prevLastReviewedAt.getTime() + row.prevInterval * DAY_MS)
      : new Date(Date.now() + row.prevInterval * DAY_MS);

    await tx.card.update({
      where: { id: row.cardId },
      data: {
        ease: row.prevEase,
        intervalDays: row.prevInterval,
        reps: row.prevReps,
        lapses: row.prevLapses,
        lastReviewedAt: row.prevLastReviewedAt,
        dueAt: baseDueAt,
        leech: row.prevLapses >= 8,
      },
    });

    await tx.reviewLog.delete({ where: { id: row.id } });
  });

  revalidatePath("/review");
  revalidatePath("/today");
}

// ----- ensureCards (unchanged from M1; M2.5 will scope by createdById) -----

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

