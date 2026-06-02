import type { PayloadLogger } from 'payload'

import type { LectureMetadata } from '@/lib/lectures/nirmalaVidya'
import type { Image, Lecture } from '@/payload-types'

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

export type ThumbnailRef = number | Image | null | undefined

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

/** Extracts a usable CDN URL from a thumbnail relationship (populated or null). */
function thumbnailUrl(ref: ThumbnailRef): string | null {
  if (ref && typeof ref === 'object' && typeof ref.url === 'string') return ref.url
  return null
}

/**
 * Resolve a viewer-item thumbnail URL: editor override first, then a generic
 * fallback URL. Both arguments are optional — returns `null` when nothing
 * resolves.
 */
export function resolveThumbnailUrl(args: {
  override?: ThumbnailRef
  fallback?: string | null
}): string | null {
  return thumbnailUrl(args.override) ?? args.fallback ?? null
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
