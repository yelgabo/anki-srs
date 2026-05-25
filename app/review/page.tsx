import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureCards } from "./actions";
import ReviewCard from "./ReviewCard";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const userId = session.user.id;
  await ensureCards(userId);

  const now = new Date();

  // Prefer cards due now; fall back to any unreviewed card so first-time users see something.
  const due = await prisma.card.findFirst({
    where: { userId, dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    include: { problem: true },
  });

  const dueCount = await prisma.card.count({ where: { userId, dueAt: { lte: now } } });
  const totalCount = await prisma.card.count({ where: { userId } });

  if (!due) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">All caught up</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          No cards due right now. You have {totalCount} card{totalCount === 1 ? "" : "s"} scheduled.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Review</h1>
        <span className="text-xs text-neutral-500">
          {dueCount} due · {totalCount} total
        </span>
      </header>
      <ReviewCard
        card={{
          id: due.id,
          intervalDays: due.intervalDays,
          reps: due.reps,
          problem: {
            title: due.problem.title,
            source: due.problem.source,
            url: due.problem.url,
            prompt: due.problem.prompt,
            approach: due.problem.approach,
            tags: due.problem.tags,
          },
        }}
      />
    </div>
  );
}
