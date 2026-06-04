import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { activeCardWhere, hasAnyActiveCard } from "@/lib/active-cards";
import { selfHealActiveCards } from "@/lib/groups";
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

  const gi = user.groupsInitialized;
  await selfHealActiveCards(userId, gi);
  const scope = activeCardWhere(userId, gi);

  const tz = user.timezone;
  const now = new Date();
  const threeDaysAhead = new Date(now.getTime() + THREE_DAYS_MS);

  const dueRowsCount = await prisma.card.count({
    where: { ...scope, dueAt: { lte: now } },
  });
  const cap = user.dailyReviewCap;
  const dueCount = Math.min(dueRowsCount, cap);
  const excessDue = Math.max(0, dueRowsCount - cap);

  const dueSoonCount = await prisma.card.count({
    where: { ...scope, dueAt: { gt: now, lte: threeDaysAhead } },
  });

  const nextDue = await prisma.card.findFirst({
    where: { ...scope, dueAt: { gt: now } },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });

  const hasAnyCards = (await prisma.card.count({ where: { userId } })) > 0;

  const anyActive = await hasAnyActiveCard(userId, gi);

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

  const projectedHint =
    projected.daily > actual.daily
      ? projected.freezesUsedThisMonth > actual.freezesUsedThisMonth
        ? "+1 today (auto-freeze)"
        : "+1 today"
      : null;

  return (
    <div className="space-y-8 sm:space-y-10">
      <TimezoneCapture />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="label">anki / srs</span>
          <span className="label text-fg-4">·</span>
          <span className="label normal-case tracking-normal text-fg-3 font-sans text-xs">
            {session.user.email}
          </span>
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
              className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Stats — stack on mobile, 3-col on sm+ */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Daily" value={actual.daily} suffix="days" highlight={projectedHint !== null} />
        <Stat label="This week" value={`${actual.daysThisWeek}/5`} suffix={actual.weekly > 0 ? `${actual.weekly}wk streak` : "this week"} />
        <Stat label="Longest" value={actual.longest} suffix="days" muted />
      </section>

      {projectedHint && (
        <div className="-mt-4 sm:-mt-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
          {projectedHint} — review a card to lock it in.
        </div>
      )}

      {/* Primary CTA */}
      {dueCount > 0 ? (
        <section className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7">
          <div>
            <p className="label">Today</p>
            <p className="mt-2 text-4xl sm:text-5xl font-semibold tracking-tight">
              <span className="mono tabular">{dueCount}</span>
              <span className="text-fg-3 font-normal text-2xl sm:text-3xl ml-2">due</span>
            </p>
          </div>

          <form action={startSessionAction}>
            <button
              type="submit"
              className="flex h-12 w-full sm:w-auto items-center justify-center rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
            >
              Start session →
            </button>
          </form>

          {excessDue > 0 && (
            <p className="text-sm text-fg-3">
              +<span className="mono tabular">{excessDue}</span> more queued by your
              cap of <span className="mono tabular">{cap}</span>.{" "}
              <Link
                href="/review?force=1"
                className="text-accent hover:underline whitespace-nowrap"
              >
                Review them anyway →
              </Link>
            </p>
          )}
        </section>
      ) : (
        <DoneState
          hasAnyCards={hasAnyCards}
          excessDueToday={excessDue}
          dueSoonCount={dueSoonCount}
          nextDueAt={nextDue?.dueAt ?? null}
          now={now}
          hasAnyActiveCard={anyActive}
        />
      )}

      <footer className="pt-6 mt-4 border-t border-border">
        <p className="mono text-xs text-fg-4 tabular">
          {todayKey} · {tz}
        </p>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  highlight = false,
  muted = false,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 sm:p-4 " +
        (highlight
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface")
      }
    >
      <p className="label">{label}</p>
      <p
        className={
          "mt-1.5 sm:mt-2 mono tabular font-semibold leading-none " +
          (muted ? "text-2xl sm:text-3xl text-fg-2" : "text-2xl sm:text-4xl text-fg")
        }
      >
        {value}
      </p>
      {suffix && (
        <p className="mt-1 text-[10px] sm:text-xs text-fg-3 truncate">{suffix}</p>
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
  hasAnyActiveCard,
}: {
  hasAnyCards: boolean;
  excessDueToday: number;
  dueSoonCount: number;
  nextDueAt: Date | null;
  now: Date;
  hasAnyActiveCard: boolean;
}) {
  const state = selectDoneState({
    hasAnyCards,
    excessDueToday,
    dueSoonCount,
    nextDueAt,
    now,
    hasAnyActiveCard,
  });

  return (
    <section className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7">
      <div>
        <p className="label">Today</p>
        <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight leading-snug">
          {state.copy}
        </p>
      </div>
      {state.showDueSoonCta && (
        <Link
          href={`/review?ahead=${Math.min(5, dueSoonCount)}`}
          className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-lg border border-border-hi bg-surface-2 px-6 font-medium text-fg hover:border-accent hover:text-accent transition-colors"
        >
          Review {Math.min(5, dueSoonCount)} due soon →
        </Link>
      )}
      {state.showGroupsCta && (
        <Link
          href="/groups"
          className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-lg border border-border-hi bg-surface-2 px-6 font-medium text-fg hover:border-accent hover:text-accent transition-colors"
        >
          Manage groups →
        </Link>
      )}
    </section>
  );
}
