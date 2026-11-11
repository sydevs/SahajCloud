import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Store how many cues the column holds, so `status` can be derived without it.
 *
 * `status` answers "are there cues?", and the only way to give a reader that
 * answer was to send them back the whole `segments` column — so a client feed
 * asking whether a transcript was ready paid for every cue in it. A stored
 * count has one writer and cannot claim `processing`, so it is not the stored
 * status column `status.ts` rejects.
 *
 * Kept apart from `applyGlossaryToSegments`, which rewrites the same column:
 * that hook returns early for a write carrying no language of its own, and the
 * count owes nothing to the language.
 */
export const stampSegmentCount: CollectionBeforeChangeHook = ({ data }) => {
  // A partial update that never names `segments` leaves the count alone — the
  // cues it counts are the ones already stored.
  if (!('segments' in data)) return data

  return { ...data, segmentCount: Array.isArray(data.segments) ? data.segments.length : 0 }
}
