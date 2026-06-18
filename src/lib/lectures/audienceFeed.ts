import type { PayloadLogger } from 'payload'

import { shapeLecture, type LecturePlayerData } from '@/lib/lectures/lectureShape'
import type { Lecture } from '@/payload-types'

/**
 * Order a pool of lectures into the audience-feed shape shared by
 * `/api/lectures/for-audience` and the empty-result fallback of
 * `/api/meditations/:id/related-lectures`.
 *
 * Selection rules (mirrors the `priority` field's admin description):
 *   - Lectures with `priority > 0` are pinned ahead of the normal pool and
 *     sorted by priority descending; ties within the pinned group are shuffled.
 *   - The normal pool (`priority ≤ 0` / unset) is uniformly shuffled.
 *   - Unplayable lectures (no usable `metadata.hlsUrl`) are dropped by
 *     `shapeLecture`.
 *   - The combined `[...pinned, ...normal]` list is sliced to `limit`.
 *
 * Requires the source `payload.find` to use `depth ≥ 2` so a clip's
 * `fullLecture` is populated (clips source their metadata from the parent).
 *
 * @param eligibleAudienceIds - Passed through to `shapeLecture` to gate a
 *   clip's `fullLectureId` on parent-audience intersection (#341).
 * @param random - Injectable RNG (defaults to `Math.random`) so tests can make
 *   the shuffle deterministic.
 */
export function selectAudienceFeed(args: {
  lectures: Lecture[]
  limit: number
  eligibleAudienceIds: number[] | null
  logger?: Pick<PayloadLogger, 'warn'>
  random?: () => number
}): LecturePlayerData[] {
  const { lectures, limit, eligibleAudienceIds, logger, random = Math.random } = args

  // Fisher-Yates in place using the injectable RNG.
  function shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }

  const pinnedRaw = lectures.filter((l) => (l.priority ?? 0) > 0)
  const normalRaw = lectures.filter((l) => (l.priority ?? 0) <= 0)

  // Pinned pool: shape, shuffle for tie-breaking, then stable-sort by priority
  // descending. Partition on raw docs so `priority` is accessible before shaping.
  const pinnedPairs = pinnedRaw
    .map((l) => ({
      priority: l.priority ?? 0,
      shaped: shapeLecture(l, logger, eligibleAudienceIds),
    }))
    .filter((p): p is { priority: number; shaped: LecturePlayerData } => p.shaped !== null)
  shuffle(pinnedPairs)
  pinnedPairs.sort((a, b) => b.priority - a.priority)
  const shapedPinned = pinnedPairs.map((p) => p.shaped)

  // Normal pool: uniform shuffle.
  const shapedNormal = normalRaw
    .map((l) => shapeLecture(l, logger, eligibleAudienceIds))
    .filter((item): item is LecturePlayerData => item !== null)
  shuffle(shapedNormal)

  return [...shapedPinned, ...shapedNormal].slice(0, limit)
}
