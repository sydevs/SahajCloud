/**
 * How a day is spelled in `atlas-snapshots`.
 *
 * Shared because the nightly task writes the key and the tiles read it back:
 * spelled twice, one side would eventually format a date the other cannot
 * find, and a tile with no comparison looks exactly like a tile whose
 * comparison is zero.
 */
export function snapshotDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}
