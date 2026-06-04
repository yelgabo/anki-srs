import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listGroupsView } from "@/lib/group-views";
import {
  createGroupAction,
  activateGroupAction,
  duplicateGroupAction,
} from "./actions";
import GroupToggle from "./GroupToggle";

export const dynamic = "force-dynamic";

function errorMessage(code: string): string {
  if (code === "forbidden") return "Not allowed.";
  if (code === "not_found") return "Not found.";
  if (code === "invalid_problem") return "Invalid input.";
  if (code === "cap_exceeded") return "You've hit a limit.";
  if (code === "rate_limited") return "Slow down a moment.";
  return "Something went wrong.";
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const sp = await searchParams;
  const view = await listGroupsView(userId);

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="label">anki / srs · groups</span>
        <Link
          href="/today"
          className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors flex items-center"
        >
          ← today
        </Link>
      </header>

      {sp.error && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {errorMessage(sp.error)}
        </p>
      )}

      {/* ACTIVE section */}
      {view.active.length > 0 && (
        <section className="space-y-3">
          <p className="label">Active</p>
          <div className="space-y-2">
            {view.active.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
              >
                <Link
                  href={`/groups/${g.id}`}
                  className="flex-1 font-medium text-fg hover:text-accent transition-colors truncate"
                >
                  {g.name}
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-fg-3">
                    <span className="mono tabular">{g.dueCount}</span> due
                  </span>
                  <GroupToggle groupId={g.id} isActive />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* YOUR GROUPS section */}
      <section className="space-y-3">
        <p className="label">Your groups</p>
        <div className="space-y-2">
          {view.owned.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <Link
                href={`/groups/${g.id}`}
                className="flex-1 font-medium text-fg hover:text-accent transition-colors truncate"
              >
                {g.name}
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-fg-3">
                  <span className="mono tabular">{g.problemCount}</span> cards
                </span>
                <GroupToggle groupId={g.id} isActive={false} />
              </div>
            </div>
          ))}
        </div>

        {/* Inline create form */}
        <form
          action={createGroupAction}
          className="flex items-center gap-2 pt-1"
        >
          <input
            name="name"
            placeholder="New group name"
            required
            className="flex-1 h-9 rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
          />
          <button
            type="submit"
            className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors shrink-0"
          >
            Create
          </button>
        </form>
      </section>

      {/* BROWSE SHARED section */}
      {view.sharedCatalog.length > 0 && (
        <section className="space-y-3">
          <p className="label">Browse shared</p>
          <div className="space-y-2">
            {view.sharedCatalog.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
              >
                <Link
                  href={`/groups/${g.id}`}
                  className="font-medium text-fg hover:text-accent transition-colors"
                >
                  {g.name}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={activateGroupAction}>
                    <input type="hidden" name="groupId" value={g.id} />
                    <button
                      type="submit"
                      className="h-8 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors"
                    >
                      Activate
                    </button>
                  </form>
                  {g.isSystem && (
                    <form action={duplicateGroupAction}>
                      <input type="hidden" name="sourceGroupId" value={g.id} />
                      <button
                        type="submit"
                        className="h-8 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors"
                      >
                        Make my own copy
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer orphan link */}
      {view.orphanedCount > 0 && (
        <footer className="pt-2 border-t border-border">
          <Link
            href="/groups/orphans"
            className="text-sm text-fg-3 hover:text-accent transition-colors"
          >
            <span className="mono tabular">{view.orphanedCount}</span> cards in no active group →
          </Link>
        </footer>
      )}
    </div>
  );
}
