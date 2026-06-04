// Pure selector for the /today done-state copy. See spec §"Done-state copy variants".

export type DoneVariant = "A" | "B" | "C" | "D" | "E" | "F";

export interface DoneState {
  variant: DoneVariant;
  copy: string;
  showDueSoonCta: boolean;
  showGroupsCta?: boolean;
}

export interface DoneArgs {
  hasAnyCards: boolean;
  /** Effective active-set has at least one card. */
  hasAnyActiveCard: boolean;
  /** Cards with dueAt <= now that the cap deferred. */
  excessDueToday: number;
  /** Cards with dueAt in (now, now + 3d]. */
  dueSoonCount: number;
  /** Earliest dueAt > now, OR null if no future scheduled cards. */
  nextDueAt: Date | null;
  /** For formatting. */
  now: Date;
}

export function selectDoneState(args: DoneArgs): DoneState {
  // A: no cards yet
  if (!args.hasAnyCards) {
    return { variant: "A", copy: "No cards in your deck yet.", showDueSoonCta: false };
  }

  // F: has cards, but none in any active group (deactivated everything)
  if (!args.hasAnyActiveCard) {
    return {
      variant: "F",
      copy: "No active groups. Activate one to start studying.",
      showDueSoonCta: false,
      showGroupsCta: true,
    };
  }

  // B: cap-overflow today
  if (args.excessDueToday > 0) {
    return {
      variant: "B",
      copy: `+${args.excessDueToday} more due today.`,
      showDueSoonCta: false,
    };
  }

  // C: has due-soon, has next-due
  if (args.dueSoonCount > 0 && args.nextDueAt) {
    return {
      variant: "C",
      copy: `Next: ${args.dueSoonCount} due ${shortDate(args.nextDueAt, args.now)}`,
      showDueSoonCta: true,
    };
  }

  // D: no due-soon, has future next-due
  if (args.nextDueAt) {
    return {
      variant: "D",
      copy: `Next review: ${shortDate(args.nextDueAt, args.now)}`,
      showDueSoonCta: false,
    };
  }

  // E: has cards but nothing scheduled (suspended/leech edge)
  return { variant: "E", copy: "All caught up — nothing scheduled.", showDueSoonCta: false };
}

function shortDate(d: Date, now: Date): string {
  const days = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}
