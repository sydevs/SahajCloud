/**
 * What the chunked run asks for next, and what it shows while it waits.
 *
 * The loop itself is three awaits in a client component. These are the
 * decisions inside it worth pinning: that it stops rather than asks forever,
 * and that a geocoder outage leaves it somewhere it can resume from.
 */

/** The counts `POST /:id/resolve` answers with. */
export interface ResolveReport {
  total: number
  resolved: number
  duplicates: number
  errors: number
  pending: number
  done: boolean
}

export type ResolveVerdict = 'propose' | 'resolve' | 'stalled'

/**
 * Whether the run asks for another chunk, proposes, or gives up.
 *
 * ⚠ **`stalled` is not a theoretical arm.** Every chunk writes either an answer
 * or a reason onto each row it touches, so `pending` falls — and that fall is
 * the loop's only bound. A chunk that wrote neither would spend the batch's
 * whole geocoder budget in a tight loop against Mapbox, so termination is
 * decided here rather than left to the endpoint's good behaviour.
 *
 * `previousPending` is null on the first chunk, which has nothing to compare to.
 */
export function resolveVerdict(
  previousPending: null | number,
  latest: ResolveReport,
): ResolveVerdict {
  if (latest.done) return 'propose'
  if (previousPending !== null && latest.pending >= previousPending) return 'stalled'
  return 'resolve'
}

/**
 * How much of the batch has an answer, 0 to 1.
 *
 * A row counts as settled once it has either — an unreachable address is as
 * finished as a geocoded one, and a bar that only moved for successes would
 * stall on a file full of typos.
 */
export function resolveProgress(latest: ResolveReport): number {
  if (latest.total <= 0) return 1
  const settled = latest.total - latest.pending
  return Math.min(1, Math.max(0, settled / latest.total))
}

/** What a finished run reports, in the order a volunteer reads it. */
export function resolveSummary(latest: ResolveReport): string {
  const parts = [`${latest.resolved} ready`]
  if (latest.duplicates) parts.push(`${latest.duplicates} already in the Atlas`)
  if (latest.errors) parts.push(`${latest.errors} skipped`)
  return `${latest.total} rows — ${parts.join(', ')}.`
}

export const STALLED_REFUSAL =
  'The resolve step stopped making progress. Re-upload the file, or ask an admin to look at the batch.'
