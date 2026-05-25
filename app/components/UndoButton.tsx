import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { undoAction } from "@/app/review/actions";

export default async function UndoButton() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const thirtySecAgo = new Date(Date.now() - 30 * 1000);
  const row = await prisma.reviewLog.findFirst({
    where: { userId: session.user.id, reviewedAt: { gt: thirtySecAgo } },
    orderBy: { reviewedAt: "desc" },
    select: { id: true },
  });
  if (!row) return null;

  return (
    <form action={undoAction}>
      <button
        type="submit"
        title="Undo your most recent grade (within 30s)"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        ↶ Undo
      </button>
    </form>
  );
}
