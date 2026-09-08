/**
 * Soft per-key length status for a translation's UI slot.
 *
 * `maxLength` is advisory by default: an over-length string still saves. The
 * admin surfaces it as a per-row reference ("max 14 characters") and, once
 * exceeded, a live count against the max ("18 / 14 characters") + a warning.
 * `lengthStatus` returns `null` when the key has no (positive) `maxLength` so
 * callers render nothing.
 *
 * A `strict` key is different: its limit is emitted into the field's JSON
 * Schema, so Payload refuses the save. `blocking` says so, and the row renders
 * an error rather than a warning — otherwise the admin promises a save that the
 * server is about to reject.
 *
 * Accepts one value or several (a plural row shares a single counter across its
 * category inputs): the longest wins. Length is counted in Unicode code points
 * (`[...value]`), not UTF-16 units, so a surrogate-pair glyph (emoji, rare CJK)
 * counts once rather than twice — closer to "characters a reader sees" for the
 * international copy this exists to serve.
 */
export interface LengthStatus {
  /** The key's character budget. */
  maxLength: number
  /** Longest value's length, in code points. */
  length: number
  /** True once the longest value exceeds `maxLength`. */
  over: boolean
  /** True when going over will be refused on save (a `strict` key). */
  blocking: boolean
}

export function lengthStatus(
  value: string | string[],
  maxLength?: number,
  strict = false,
): LengthStatus | null {
  if (typeof maxLength !== 'number' || maxLength <= 0) return null
  const values = Array.isArray(value) ? value : [value]
  const length = values.reduce((max, v) => Math.max(max, [...v].length), 0)
  const over = length > maxLength
  return { maxLength, length, over, blocking: strict && over }
}
