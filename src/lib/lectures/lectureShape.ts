import type { PayloadLogger } from 'payload'


import { resolveThumbnailUrl } from '@/lib/utilities/thumbnailUrl'
import type { Lecture, LectureMetadata, LecturesSelect } from '@/payload-types'

/**
 * Bounded include-mode `select` covering exactly the fields the feed/player
 * shaping path reads — {@link shapeLecture} plus `selectAudienceFeed`'s
 * `priority` partition. Pass it to any internal `depth ≥ 2` lectures read that
 * only builds `LecturePlayerData` (`/api/lectures/for-audience`, and the base of
 * `/api/meditations/:id/related-lectures`).
 *
 * The point is to keep the top-level lectures `clips` join field (a per-row
 * subquery) from firing across the whole candidate pool — an include-mode select
 * strips it before its afterRead runs, so the pool read stays flat instead of
 * N+1 (#541).
 *
 * `fullLecture` is selected wholesale (`true`) so a clip's parent populates at
 * depth: the clip sources its playback `metadata` and `fullLectureId`-gate
 * `audiences` from it. `select` can't narrow a *relationship's* fields (that's a
 * populate concern, not a select one), so the parent's own `clips` join is
 * bounded separately by `Lectures.defaultPopulate: { clips: false }` — the
 * nested-population analog of this top-level skip. The related-lectures ranking
 * loop additionally reads `subtleSystemNodes` / `userChoices`; it spreads those
 * onto this base rather than bloating the shared feed select (for-audience
 * doesn't rank, so it doesn't need them).
 */
export const LECTURE_FEED_SELECT = {
  type: true,
  title: true,
  metadata: true,
  startTime: true,
  stopTime: true,
  thumbnail: true,
  subtitles: true,
  priority: true,
  fullLecture: true,
} satisfies LecturesSelect<true>

/**
 * Flat, playback-ready shape for a lecture returned from /api/lectures/for-audience
 * and /api/meditations/:id/related-lectures.
 *
 * Every record carries the same shape — no excerpt-vs-full branching at the
 * response layer. A record that defines `startTime`/`stopTime` represents a
 * playback window; if `stopTime` is `null`/absent, defaults are derived from
 * the source `metadata.duration`. For clips, the source is the parent lecture's
 * metadata, not the clip's own (clips have `metadata: null`). `fullLectureId`
 * is informational — populated for clips, `null` for full lectures.
 *
 * `title` is nullable (localized + hook-populated). `stopTime` and `duration`
 * may be `null` when neither an explicit value nor `metadata.duration` is
 * available.
 */
export type LecturePlayerData = {
  id: number
  title: string | null | undefined
  hlsUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: number
  stopTime: number | null
  duration: number | null
  fullLectureId: number | null
}

/**
 * Merge per-locale subtitle overrides on top of the lecture's NV-sourced
 * subtitle map. The base map is the baseline; each non-empty override row
 * replaces the URL for one locale.
 */
export function mergeSubtitles(
  baseMap: Record<string, string> | null | undefined,
  overrides: Lecture['subtitles'] | null | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...(baseMap ?? {}) }
  if (!Array.isArray(overrides)) return merged
  for (const row of overrides) {
    if (row?.locale && row?.url) {
      merged[row.locale] = row.url
    }
  }
  return merged
}

/**
 * Resolve the `fullLectureId` for a clip, gated on audience eligibility.
 *
 * When `eligibleAudienceIds` is `null` (no gating), returns the parent ID
 * unconditionally (backward-compatible). When provided, returns the parent ID
 * only if the parent's audiences intersect `eligibleAudienceIds`; otherwise
 * returns `null` to avoid leaking the existence of a restricted parent.
 */
function resolveFullLectureId(
  parent: Lecture | null,
  eligibleAudienceIds: number[] | null,
): number | null {
  if (!parent) return null
  if (eligibleAudienceIds === null) return parent.id
  const parentAudienceIds = ((parent.audiences ?? []) as Array<number | { id: number }>).map((a) =>
    typeof a === 'number' ? a : a.id,
  )
  return eligibleAudienceIds.some((id) => parentAudienceIds.includes(id)) ? parent.id : null
}

/**
 * Shape a Lecture record into a `LecturePlayerData` for the audience-facing
 * endpoints. For clips, sources NV `metadata` from the parent lecture (clips
 * have `metadata: null` after #338 — the parent owns the canonical NV data).
 *
 * Per-clip `thumbnail` and `subtitles` overrides still win/merge as before.
 *
 * Returns `null` when no usable `metadata.hlsUrl` is available (full lecture
 * with missing metadata, or clip whose parent isn't populated / missing
 * metadata) — the endpoint filters these out.
 *
 * Requires `depth ≥ 2` on the lecture query so a clip's `fullLecture` is
 * populated as a `Lecture` object rather than a numeric id.
 *
 * @param eligibleAudienceIds - When provided, gates `fullLectureId` on
 *   parent-audience intersection (#341). Pass `null` for no gating (default,
 *   backward-compatible).
 */
export function shapeLecture(
  lecture: Lecture,
  logger?: Pick<PayloadLogger, 'warn'>,
  eligibleAudienceIds: number[] | null = null,
): LecturePlayerData | null {
  const isClip = lecture.type === 'clip'
  const parent =
    isClip && lecture.fullLecture && typeof lecture.fullLecture === 'object'
      ? (lecture.fullLecture as Lecture)
      : null
  const metadataSource = isClip ? parent : lecture
  const metadata = (metadataSource?.metadata ?? null) as LectureMetadata | null

  if (!metadata?.hlsUrl) {
    logger?.warn({
      msg: 'Lecture missing metadata.hlsUrl — skipping',
      lectureId: lecture.id,
      isClip,
      parentId: parent?.id,
    })
    return null
  }

  const startTime = typeof lecture.startTime === 'number' ? lecture.startTime : 0
  const stopTime =
    typeof lecture.stopTime === 'number' ? lecture.stopTime : (metadata.duration ?? null)
  const duration = stopTime !== null ? stopTime - startTime : null

  return {
    id: lecture.id,
    title: lecture.title,
    hlsUrl: metadata.hlsUrl,
    thumbnailUrl: resolveThumbnailUrl({
      override: lecture.thumbnail,
      fallback: metadata.thumbnailUrl,
    }),
    subtitles: mergeSubtitles(metadata.subtitles, lecture.subtitles),
    startTime,
    stopTime,
    duration,
    fullLectureId: isClip ? resolveFullLectureId(parent, eligibleAudienceIds) : null,
  }
}
