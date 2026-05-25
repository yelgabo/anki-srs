import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureCards } from "@/app/review/actions";
import { startSessionAction } from "./actions";
import { computeStreak } from "@/lib/streak";
import { dayKey } from "@/lib/timezone";
import { selectDoneState } from "@/lib/done-copy";
import UndoButton from "@/app/components/UndoButton";
import TimezoneCapture from "@/app/components/TimezoneCapture";

export const dynamic = "force-dynamic";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const userId = session.user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/signin");

  await ensureCards(userId);

  const tz = user.timezone;
  const now = new Date();
  const threeDaysAhead = new Date(now.getTime() + THREE_DAYS_MS);

  // Due counts
  const dueRowsCount = await prisma.card.count({
    where: { userId, dueAt: { lte: now } },
  });
  const cap = user.dailyReviewCap;
  const dueCount = Math.min(dueRowsCount, cap);
  const excessDue = Math.max(0, dueRowsCount - cap);

  // Due-soon (next 3 days)
  const dueSoonCount = await prisma.card.count({
    where: { userId, dueAt: { gt: now, lte: threeDaysAhead } },
  });

  // Next due (any future)
  const nextDue = await prisma.card.findFirst({
    where: { userId, dueAt: { gt: now } },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });

  // Has any card at all?
  const hasAnyCards = (await prisma.card.count({ where: { userId } })) > 0;

  // Streak — actual + projected
  const reviewDayRows = await prisma.$queryRaw<{ d: Date }[]>`
    SELECT DISTINCT (date_trunc('day', "reviewedAt" AT TIME ZONE ${tz}))::date AS d
    FROM "ReviewLog"
    WHERE "userId" = ${userId}
    ORDER BY d DESC
    LIMIT 400
  `;
  const freezeDayRows = await prisma.$queryRaw<{ d: Date }[]>`
    SELECT "usedOn" AS d FROM "StreakFreeze" WHERE "userId" = ${userId} ORDER BY d DESC LIMIT 400
  `;

  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const reviewDays = reviewDayRows.map((r) => toKey(r.d));
  const freezeDays = freezeDayRows.map((r) => toKey(r.d));
  const todayKey = dayKey(now, tz);

  const actual = computeStreak({ reviewDays, freezeDays, timezone: tz, now });
  const projected = computeStreak({
    reviewDays,
    freezeDays,
    timezone: tz,
    now,
    assumeActiveDays: [todayKey],
  });

  return (
    <div className="space-y-8">
      <TimezoneCapture />

      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Signed in as <span className="font-mono">{session.user.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UndoButton />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Streak chips */}
      <section className="flex flex-wrap gap-3">
        <Chip
          label="Daily streak"
          value={actual.daily}
          hint={
            projected.daily > actual.daily
              ? projected.freezesUsedThisMonth > actual.freezesUsedThisMonth
                ? "+1 with auto-freeze if you review today"
                : "+1 if you review today"
              : undefined
          }
        />
        <Chip
          label="Weekly"
          value={`${actual.daysThisWeek}/5`}
          hint={actual.weekly > 0 ? `${actual.weekly}-week streak` : undefined}
        />
        {actual.longest > 0 && (
          <Chip label="Longest" value={actual.longest} />
        )}
      </section>

      {/* Main CTA — session or done state */}
      {dueCount > 0 ? (
        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {dueCount} due now
            </h2>
            {excessDue > 0 && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                +{excessDue} more queued by your daily cap of {cap}.{" "}
                <Link href="/review?force=1" className="underline">
                  Review them anyway →
                </Link>
              </p>
            )}
          </div>
          <form action={startSessionAction}>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Start session →
            </button>
          </form>
        </section>
      ) : (
        <DoneState
          hasAnyCards={hasAnyCards}
          excessDueToday={excessDue}
          dueSoonCount={dueSoonCount}
          nextDueAt={nextDue?.dueAt ?? null}
          now={now}
        />
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="font-mono text-lg">{value}</div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
          {hint}
        </div>
      )}
    </div>
  );
}

function DoneState({
  hasAnyCards,
  excessDueToday,
  dueSoonCount,
  nextDueAt,
  now,
}: {
  hasAnyCards: boolean;
  excessDueToday: number;
  dueSoonCount: number;
  nextDueAt: Date | null;
  now: Date;
}) {
  const state = selectDoneState({
    hasAnyCards,
    excessDueToday,
    dueSoonCount,
    nextDueAt,
    now,
  });

  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-xl font-semibold tracking-tight">{state.copy}</h2>
      {state.showDueSoonCta && (
        <Link
          href={`/review?ahead=${Math.min(5, dueSoonCount)}`}
          className="inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Review {Math.min(5, dueSoonCount)} due soon →
        </Link>
      )}
    </section>
  );
}
