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
        className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5"
      >
        <span aria-hidden>↶</span>
        <span>Undo</span>
      </button>
    </form>
  );
}
