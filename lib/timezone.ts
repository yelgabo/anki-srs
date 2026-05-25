// Timezone-aware day/week/month helpers.
// All return string keys ("2026-05-25", "2026-W21") usable as Map keys.

export function dayKey(date: Date, tz: string): string {
  // en-CA gives YYYY-MM-DD, which is the only format Intl produces stably across runtimes.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function weekKey(date: Date, tz: string): string {
  // ISO week: Monday-anchored. Year is the year of the Thursday of that week.
  // Implemented by finding the date's local day-of-week, walking back to Monday, then to Thursday.
  const localISO = dayKey(date, tz); // "YYYY-MM-DD"
  const [y, m, d] = localISO.split("-").map(Number);
  // Construct a UTC date for the local Y/M/D so we can do day math without TZ ambiguity.
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const isoDow = ((noon.getUTCDay() + 6) % 7) + 1; // Mon=1 ... Sun=7
  const thursday = new Date(noon.getTime() + (4 - isoDow) * 86_400_000);
  const thursdayYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(thursdayYear, 0, 4, 12, 0, 0));
  const jan4Dow = ((jan4.getUTCDay() + 6) % 7) + 1;
  const week1Monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86_400_000);
  const weekNum = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return `${thursdayYear}-W${String(weekNum).padStart(2, "0")}`;
}

export function startOfMonth(date: Date, tz: string): string {
  const k = dayKey(date, tz);
  return k.slice(0, 7) + "-01";
}

// Parse a "YYYY-MM-DD" key into a JS Date at UTC midnight.
// Useful for inserting into a Postgres `@db.Date` column without TZ drift.
export function parseDayKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Days between two day keys, exclusive of start, inclusive of end.
// daysBetween("2026-05-23", "2026-05-25") → ["2026-05-24", "2026-05-25"]
export function daysBetween(startExclusive: string, endInclusive: string): string[] {
  const out: string[] = [];
  const start = parseDayKey(startExclusive);
  const end = parseDayKey(endInclusive);
  for (let t = start.getTime() + 86_400_000; t <= end.getTime(); t += 86_400_000) {
    const dt = new Date(t);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
        dt.getUTCDate(),
      ).padStart(2, "0")}`,
    );
  }
  return out;
}

// Add days to a day key.
export function addDays(k: string, n: number): string {
  const d = parseDayKey(k);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}
