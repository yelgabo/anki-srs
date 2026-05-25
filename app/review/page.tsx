import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureCards } from "./actions";
import { readSkipCookie } from "@/lib/skip-cookie";
import ReviewCard from "./ReviewCard";
import UndoButton from "@/app/components/UndoButton";

export const dynamic = "force-dynamic";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

type SearchParams = Promise<{ ahead?: string; force?: string; error?: string }>;

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const sp = await searchParams;
  const ahead = sp.ahead ? Math.max(0, Math.min(20, Number(sp.ahead) || 0)) : 0;
  const force = sp.force === "1";

  await ensureCards(userId);

  const skipped = await readSkipCookie(userId);

  const now = new Date();
  const threeDaysAhead = new Date(now.getTime() + THREE_DAYS_MS);

  let card;
  if (ahead > 0) {
    // Due-soon picker
    card = await prisma.card.findFirst({
      where: {
        userId,
        dueAt: { gt: now, lte: threeDaysAhead },
        id: { notIn: skipped },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      include: { problem: true },
    });
  } else {
    // Due picker (force=1 ignores cap; default also picks one — cap is enforced by /today)
    card = await prisma.card.findFirst({
      where: { userId, dueAt: { lte: now }, id: { notIn: skipped } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      include: { problem: true },
    });
  }

  if (!card) redirect("/today");

  // Counts for header context
  const dueCount = await prisma.card.count({ where: { userId, dueAt: { lte: now } } });

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {ahead > 0 ? "Review ahead" : "Review"}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {ahead > 0 ? "due soon" : `${dueCount} due`}
          </span>
          <UndoButton />
        </div>
      </header>

      {sp.error === "cant_undo" && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Nothing to undo within the last 30 seconds.
        </p>
      )}
      {sp.error === "rate_limited" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Too many actions. Slow down for a moment.
        </p>
      )}

      <ReviewCard
        card={{
          id: card.id,
          intervalDays: card.intervalDays,
          reps: card.reps,
          problem: {
            title: card.problem.title,
            source: card.problem.source,
            url: card.problem.url,
            prompt: card.problem.prompt,
            approach: card.problem.approach,
            tags: card.problem.tags,
          },
        }}
        force={force}
        ahead={ahead}
      />
    </div>
  );
}
