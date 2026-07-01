import type { Image } from '@/payload-types'

/**
 * A populated-or-not thumbnail relationship value: a populated `Image` object
 * (depth ≥ 1), a raw id (depth 0), or absent. Only a populated object carries
 * a resolvable CDN `url`.
 */
export type ThumbnailRef = number | Image | null | undefined

/** Extracts a usable CDN URL from a thumbnail relationship (populated or null). */
function thumbnailUrl(ref: ThumbnailRef): string | null {
  if (ref && typeof ref === 'object' && typeof ref.url === 'string') return ref.url
  return null
}

/**
 * Resolve a card/viewer-item thumbnail URL: editor override first, then a
 * generic fallback URL. Both arguments are optional — returns `null` when
 * nothing resolves. Parameter names are intentionally domain-agnostic so any
 * caller (lectures, meditations, …) can reuse it.
 */
export function resolveThumbnailUrl(args: {
  override?: ThumbnailRef
  fallback?: string | null
}): string | null {
  return thumbnailUrl(args.override) ?? args.fallback ?? null
}
