/**
 * Which paces are due on one run, and how far back each looks.
 *
 * ⚠ **One schedule, three paces.** Daily, Weekly and Monthly are decided from
 * the same 07:00 UTC run rather than from three schedules, because three would
 * send a Weekly manager two emails on a Monday the 1st and a Daily one three.
 * Both anchors are absolute — Monday, and the 1st — never "seven days since
 * this recipient last got one", which drifts by a day on every missed run.
 *
 * `Immediate` is sent by its own trigger and `Never` by nothing, so neither is
 * ever due here. Anything else is a pace nothing declares, and is not due
 * either: a retired option must leave the managers still on it silent rather
 * than mailed daily.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const DAILY = 'Daily'
export const WEEKLY = 'Weekly'
export const MONTHLY = 'Monthly'

/** Weekly digests fire on this UTC weekday (Sunday = 0 … Monday = 1). */
const WEEKLY_ANCHOR_WEEKDAY = 1

/** Whether a pace sends on this run. */
export function isDue(frequency: string, now: Date): boolean {
  if (frequency === DAILY) return true
  if (frequency === WEEKLY) return now.getUTCDay() === WEEKLY_ANCHOR_WEEKDAY
  if (frequency === MONTHLY) return now.getUTCDate() === 1
  return false
}

/**
 * How far back a pace's "new since" window reaches when no watermark does.
 *
 * A month is 30 days rather than a calendar month: the window is a floor under
 * a missing watermark, not a statement about the month, and a reader comparing
 * two of these wants the same span either time.
 */
export function periodMs(frequency: string): number {
  if (frequency === WEEKLY) return 7 * DAY_MS
  if (frequency === MONTHLY) return 30 * DAY_MS
  return DAY_MS
}

/**
 * The start of a pace's window: the watermark, or one period back, whichever is
 * later.
 *
 * ⚠ **Clamped, and the clamp is the point.** A manager who turns a section back
 * on after six months has a watermark from six months ago, and without this the
 * first email would carry half a year of items labelled "new". The watermark
 * stops anything being sent twice; the clamp stops the first send after a gap
 * being a wall of text.
 */
export function windowStart(
  watermark: null | string | undefined,
  frequency: string,
  runStart: Date,
): Date {
  const floor = new Date(runStart.getTime() - periodMs(frequency))
  if (!watermark) return floor
  const mark = new Date(watermark)
  if (Number.isNaN(mark.getTime())) return floor
  return mark > floor ? mark : floor
}
