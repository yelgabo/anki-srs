import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeCardWhere } from "@/lib/active-cards";
import { addProblemToGroupAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function OrphansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const cards = await prisma.card.findMany({
    where: { userId, NOT: activeCardWhere(userId, true) },
    include: { problem: true },
  });

  const ownedGroups = await prisma.group.findMany({
    where: { ownerId: userId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/groups"
            className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors flex items-center"
          >
            ← groups
          </Link>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Orphaned cards</h1>
          <p className="text-sm text-fg-3">Cards with progress that aren't in any active group.</p>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-5 text-sm text-fg-3">
          Nothing here — every card is in an active group.
        </div>
      ) : (
        <section className="space-y-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="rounded-lg border border-border bg-surface overflow-hidden"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-medium text-fg truncate">{card.problem.title}</p>
                  {card.problem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {card.problem.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded text-[10px] text-fg-3 border border-border bg-surface-2"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {ownedGroups.length === 0 ? (
                    <Link
                      href="/groups"
                      className="text-xs text-accent hover:underline"
                    >
                      Create a group first
                    </Link>
                  ) : (
                    <form action={addProblemToGroupAction} className="flex items-center gap-2">
                      <input type="hidden" name="problemId" value={card.problem.id} />
                      <select
                        name="groupId"
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-fg focus:border-accent focus:outline-none transition-colors"
                      >
                        {ownedGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors"
                      >
                        Add
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
