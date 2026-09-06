/**
 * Time helpers, all time-zone aware.
 *
 * DATA_MODEL.md §7: the study `day` is computed in the **user's** time zone,
 * not UTC. A 23:30 → 00:30 session splits across two days, and a streak
 * computed in UTC breaks for anyone east or west of it. Getting this wrong is
 * invisible until someone in Rome loses a streak at 1am.
 *
 * Deliberately no date library. Intl does the zone maths, which is the only
 * hard part, and date-fns-tz would be ~20 KB for what is below.
 */

/** Civil (wall-clock) date parts for an instant in a given zone. */
export function partsInZone(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some locales/zones.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** `YYYY-MM-DD` for an instant, in a zone. This is the aggregate's `day` key. */
export function dayKeyInZone(instant: Date, timeZone: string): string {
  const { year, month, day } = partsInZone(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A `YYYY-MM-DD` key as a UTC-midnight Date, which is how Postgres `@db.Date`
 * columns round-trip through Prisma without drifting a day.
 */
export function dayKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function dateToDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC offset of a zone at an instant, in minutes. Handles DST correctly. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const { year, month, day, hour, minute } = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Seconds are not in the parts, so compare on whole minutes.
  return (asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000;
}

/** The instant at which a given wall-clock day starts in a zone. */
export function startOfDayInZone(dayKey: string, timeZone: string): Date {
  const guess = new Date(`${dayKey}T00:00:00.000Z`);
  const offset = zoneOffsetMinutes(guess, timeZone);
  const adjusted = new Date(guess.getTime() - offset * 60000);
  // One correction pass settles the DST edge where the offset differs either
  // side of local midnight.
  const settled = zoneOffsetMinutes(adjusted, timeZone);
  return settled === offset
    ? adjusted
    : new Date(guess.getTime() - settled * 60000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addDaysToKey(key: string, days: number): string {
  return dateToDayKey(addDays(dayKeyToDate(key), days));
}

/**
 * Splits a session across day boundaries **in the user's zone**, returning the
 * seconds that belong to each day. This is the function DATA_MODEL.md §7 is
 * describing, and every aggregate write goes through it.
 */
export function splitAcrossDays(
  startedAt: Date,
  endedAt: Date,
  timeZone: string,
): { day: string; seconds: number }[] {
  if (endedAt <= startedAt) return [];

  const out: { day: string; seconds: number }[] = [];
  let cursor = startedAt;

  // Bounded so a corrupt row cannot spin forever.
  for (let guard = 0; guard < 400 && cursor < endedAt; guard += 1) {
    const key = dayKeyInZone(cursor, timeZone);
    const nextDayStart = startOfDayInZone(addDaysToKey(key, 1), timeZone);
    const sliceEnd = nextDayStart < endedAt ? nextDayStart : endedAt;

    const seconds = Math.round((sliceEnd.getTime() - cursor.getTime()) / 1000);
    if (seconds > 0) out.push({ day: key, seconds });

    cursor = sliceEnd;
  }

  return out;
}

/** ISO week start for a day, honouring the user's `weekStartsOn`. */
export function startOfWeekKey(dayKey: string, weekStartsOn: number): string {
  const date = dayKeyToDate(dayKey);
  const dow = date.getUTCDay(); // 0 = Sunday
  const diff = (dow - weekStartsOn + 7) % 7;
  return dateToDayKey(addDays(date, -diff));
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
