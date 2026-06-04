import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertActiveStudyableGroup, focusGroupCardWhere } from "@/lib/group-actions";
import ReviewCard from "@/app/review/ReviewCard";

export const dynamic = "force-dynamic";

export default async function GroupStudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const { id } = await params;

  try {
    await assertActiveStudyableGroup(userId, id);
  } catch {
    redirect("/groups?error=forbidden");
  }

  const now = new Date();
  const card = await prisma.card.findFirst({
    where: { ...focusGroupCardWhere(userId, id), dueAt: { lte: now } },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    include: { problem: true },
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex items-center gap-3">
        <Link
          href={`/groups/${id}`}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors flex items-center"
        >
          ← group
        </Link>
      </header>

      {!card ? (
        <div className="rounded-lg border border-border bg-surface px-5 py-6 space-y-3">
          <p className="font-medium text-fg">Nothing due in this group.</p>
          <Link
            href={`/groups/${id}`}
            className="inline-block text-sm text-accent hover:underline"
          >
            ← Back to group
          </Link>
        </div>
      ) : (
        <ReviewCard card={card} />
      )}
    </div>
  );
}
