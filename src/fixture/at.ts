/**
 * A date relative to today, as an ISO string in UTC: `at({ days: -3, hour: 18 })`
 * is 18:00 three days ago.
 *
 * Resolved when the fixture module is evaluated, to the minute and never finer,
 * so a row using one is rewritten on the first boot of a new day and on no
 * other boot (`entryHash`).
 */
export function at(
  { days = 0, hour = 12, minute = 0 }: { days?: number; hour?: number; minute?: number },
  now: Date = new Date(),
): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour, minute),
  ).toISOString()
}
