import type { Image, LectureClip } from '@/payload-types'

/**
 * Flat, playback-ready shape for a full lecture returned from /for-audience.
 *
 * `title` is nullable (localized + hook-populated). `endTime`/`duration` may
 * be `null` on a lecture whose `metadata.duration` hasn't been backfilled
 * yet (new NV-sync field — existing rows populate on the next monthly sync).
 * `startTime` is always 0. `lectureId` is omitted — that field is
 * clip-exclusive.
 */
export type LecturePlayerData = {
  id: number
  type: 'lecture'
  title: string | null | undefined
  hlsUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: 0
  endTime: number | null
  duration: number | null
  lectureId?: undefined
}

/**
 * Flat, playback-ready shape for a lecture clip returned from /for-audience
 * and /api/meditations/:id/related-lecture-clips.
 *
 * All time fields are concrete numbers (the collection enforces
 * `endTime > startTime`), `title` is required, and `lectureId` points at
 * the parent lecture. Discriminate clip vs lecture on `type` or on the
 * presence of `lectureId`.
 */
export type LectureClipPlayerData = {
  id: number
  type: 'lecture-clip'
  title: string
  hlsUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: number
  endTime: number
  duration: number
  lectureId: number
}

export type ThumbnailRef = number | Image | null | undefined

/**
 * Merge a clip's subtitle overrides on top of its parent's NV-sourced subtitles.
 * Parent map is the baseline; each non-empty clip row overrides one locale.
 */
export function mergeSubtitles(
  parentMap: Record<string, string> | null | undefined,
  clipOverrides: LectureClip['subtitles'] | null | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...(parentMap ?? {}) }
  if (!Array.isArray(clipOverrides)) return merged
  for (const row of clipOverrides) {
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
 * Resolve a viewer-item thumbnail URL using a tier-based fallback chain:
 *   primaryOverride > secondaryOverride > fallback > null.
 *
 * For lectures: `primaryOverride` is the lecture's editor override and there
 * is no secondary. For clips: `primaryOverride` is the clip's editor override
 * and `secondaryOverride` is the parent lecture's editor override. `fallback`
 * is always the parent metadata's thumbnail URL.
 */
export function resolveThumbnailUrl(args: {
  primaryOverride?: ThumbnailRef
  secondaryOverride?: ThumbnailRef
  fallback?: string | null
}): string | null {
  return (
    thumbnailUrl(args.primaryOverride) ??
    thumbnailUrl(args.secondaryOverride) ??
    args.fallback ??
    null
  )
}
