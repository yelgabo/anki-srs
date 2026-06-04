import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { groupDetailView } from "@/lib/group-views";
import {
  renameGroupAction,
  deleteGroupAction,
  activateGroupAction,
  createProblemInGroupAction,
  editProblemAction,
  removeProblemFromGroupAction,
  duplicateGroupAction,
} from "../actions";
import GroupToggle from "../GroupToggle";
import ProblemForm from "./ProblemForm";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copied?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const { id } = await params;
  const sp = await searchParams;

  const detail = await groupDetailView(userId, id);
  if (!detail) notFound();

  // For owned problems, load full content so edit forms can prefill prompt/approach/url.
  const ownedProblemIds = detail.problems.filter((p) => p.isOwned).map((p) => p.id);
  const fullProblems = ownedProblemIds.length > 0
    ? await prisma.problem.findMany({ where: { id: { in: ownedProblemIds } } })
    : [];
  const fullProblemMap = new Map(fullProblems.map((p) => [p.id, p]));

  const visibilityLabel =
    detail.isSystem
      ? "system · shared"
      : detail.visibility === "SHARED"
      ? "shared"
      : "private";

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
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{detail.name}</h1>
          <p className="label">{visibilityLabel}</p>
        </div>
      </header>

      {sp.copied && (
        <p className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
          Copied ✓ — activate it below and consider turning off the original so you don't review cards twice.
        </p>
      )}

      {detail.isOwned ? (
        <>
          {/* Rename form */}
          <section className="space-y-3">
            <p className="label">Rename</p>
            <form action={renameGroupAction} className="space-y-2">
              <input type="hidden" name="groupId" value={detail.id} />
              <input
                name="name"
                defaultValue={detail.name}
                required
                className="block h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
              />
              <input
                name="description"
                defaultValue={detail.description ?? ""}
                placeholder="Description (optional)"
                className="block h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
              />
              <button
                type="submit"
                className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors"
              >
                Rename
              </button>
            </form>
          </section>

          {/* Toggle + study CTA */}
          <section className="flex flex-wrap items-center gap-3">
            <GroupToggle groupId={detail.id} isActive={detail.isActive} />
            {detail.isActive && (
              <Link
                href={`/groups/${detail.id}/study`}
                className="h-12 rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors flex items-center"
              >
                Study this group →
              </Link>
            )}
          </section>

          {/* Add card */}
          <section className="space-y-3">
            <p className="label">Add card</p>
            <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <ProblemForm groupId={detail.id} action={createProblemInGroupAction} />
            </div>
          </section>

          {/* Problem list */}
          {detail.problems.length > 0 && (
            <section className="space-y-3">
              <p className="label">Cards ({detail.problems.length})</p>
              <div className="space-y-2">
                {detail.problems.map((p) => {
                  const full = fullProblemMap.get(p.id);
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border bg-surface overflow-hidden"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="font-medium text-fg truncate">{p.title}</p>
                          {p.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {p.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded text-[10px] text-fg-3 border border-border bg-surface-2"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {!p.isOwned && (
                            <span className="text-xs text-fg-4">🔒 curated</span>
                          )}
                        </div>
                        <form action={removeProblemFromGroupAction} className="shrink-0">
                          <input type="hidden" name="groupId" value={detail.id} />
                          <input type="hidden" name="problemId" value={p.id} />
                          <button
                            type="submit"
                            className="h-7 rounded px-2 text-xs text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
                          >
                            remove
                          </button>
                        </form>
                      </div>

                      {p.isOwned && full && (
                        <details className="border-t border-border">
                          <summary className="px-4 py-2 text-xs text-fg-3 cursor-pointer hover:text-fg transition-colors select-none">
                            Edit
                          </summary>
                          <div className="px-4 pb-4 pt-2">
                            <p className="text-xs text-fg-4 mb-3">
                              Editing overwrites prompt and approach.
                            </p>
                            <ProblemForm
                              groupId={detail.id}
                              action={editProblemAction}
                              problem={{
                                id: p.id,
                                title: p.title,
                                prompt: full.prompt,
                                approach: full.approach,
                                tags: p.tags,
                                url: full.url ?? null,
                              }}
                            />
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Delete group */}
          <section className="space-y-2 pt-4 border-t border-border">
            <form action={deleteGroupAction}>
              <input type="hidden" name="groupId" value={detail.id} />
              <button
                type="submit"
                className="h-9 rounded-lg border border-danger/40 bg-surface px-3 text-xs text-danger hover:bg-danger/10 transition-colors"
              >
                Delete group
              </button>
            </form>
            <p className="text-xs text-fg-4">Your cards and review history are kept.</p>
          </section>
        </>
      ) : (
        <>
          {/* Read-only view for shared/system groups */}
          <section className="flex flex-wrap items-center gap-3">
            <form action={activateGroupAction}>
              <input type="hidden" name="groupId" value={detail.id} />
              <button
                type="submit"
                className="h-12 rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
              >
                Activate
              </button>
            </form>
            {detail.canDuplicate && (
              <form action={duplicateGroupAction}>
                <input type="hidden" name="sourceGroupId" value={detail.id} />
                <button
                  type="submit"
                  className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors"
                >
                  Make my own copy
                </button>
              </form>
            )}
          </section>

          {detail.problems.length > 0 && (
            <section className="space-y-3">
              <p className="label">Cards ({detail.problems.length})</p>
              <div className="space-y-2">
                {detail.problems.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                  >
                    <span className="flex-1 font-medium text-fg">{p.title}</span>
                    {p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.tags.map((tag) => (
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
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
