import type { Image, Lecture } from '@/payload-types'

/**
 * Flat, playback-ready shape for a lecture returned from /api/lectures/for-audience
 * and /api/meditations/:id/related-lectures.
 *
 * Every record carries the same shape — no excerpt-vs-full branching. A record
 * that defines `startTime`/`endTime` represents a playback window; if the field
 * is `null`/absent, defaults are derived from `metadata.duration`. `fullLectureId`
 * is informational — it points at a related lecture for editorial grouping when
 * set, otherwise `null`.
 *
 * `title` is nullable (localized + hook-populated). `endTime` and `duration` may
 * be `null` when neither an explicit value nor `metadata.duration` is available.
 */
export type LecturePlayerData = {
  id: number
  title: string | null | undefined
  hlsUrl: string
  /** @deprecated alias of `hlsUrl` — removed by #329 once mobile clients cut over. */
  videoUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: number
  endTime: number | null
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
