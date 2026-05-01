import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { isValidLocale } from '@/lib/locales'
import type { NirmalaVidyaVideoData } from '@/lib/nirmalaVidyaApi'
import { extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/nirmalaVidyaApi'

// =============================================================================
// Language Code Mapping
// =============================================================================

/**
 * Maps a Nirmala Vidya API language code to a CMS locale code.
 * Returns null for unrecognized codes (silently skipped).
 */
export function apiLanguageToLocale(apiCode: string): LocaleCode | null {
  if (isValidLocale(apiCode)) return apiCode
  // Normalize: lowercase and replace underscores with hyphens
  const normalized = apiCode.toLowerCase().replace('_', '-')
  if (isValidLocale(normalized)) return normalized
  // Special case: API may use 'pt' for Brazilian Portuguese
  if (normalized === 'pt') return 'pt-br'
  return null
}

// =============================================================================
// Metadata Shape
// =============================================================================

/**
 * Shape stored in Lectures.metadata. All NV-sourced data is bundled here so
 * the /api/lectures/for-audience response can expose the full subtitle map and
 * the monthly sync task can refresh everything in one write.
 */
export type LectureMetadata = {
  title: string
  thumbnailUrl: string | null
  hlsUrl: string
  subtitles: Partial<Record<LocaleCode, string>>
  duration: number | null
  lastSyncedAt: string
}

/**
 * Build a LectureMetadata object from an NV API response. Used by both the
 * create-time beforeChange hook and the monthly SyncLectureMetadata task.
 */
export function buildLectureMetadata(videoData: NirmalaVidyaVideoData): LectureMetadata {
  const subtitles: Partial<Record<LocaleCode, string>> = {}
  for (const subtitle of videoData.subtitles) {
    const locale = apiLanguageToLocale(subtitle.languageCode)
    if (locale) subtitles[locale] = subtitle.url
  }
  return {
    title: videoData.title,
    thumbnailUrl: videoData.thumbnailUrl,
    hlsUrl: videoData.hlsUrl,
    subtitles,
    duration: videoData.duration,
    lastSyncedAt: new Date().toISOString(),
  }
}

// =============================================================================
// beforeChange Hooks
// =============================================================================

/**
 * Resolve a clip's parent full lecture before NV fetch runs.
 *
 * For clip creates only: validates that exactly one of `nirmalVidyaVimeoUrl` or
 * `fullLecture` is supplied (both is fine — `fullLecture` wins), looks up an
 * existing full lecture by URL or creates one on the fly, and nulls out the
 * URL on the clip record (it was a creation-time lookup key only).
 *
 * Must run BEFORE `populateFromNirmalaVidya`, which then no-ops because
 * `data.type === 'clip'`.
 */
export const resolveClipParent: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (data.type !== 'clip') return data

  const url = typeof data.nirmalVidyaVimeoUrl === 'string' ? data.nirmalVidyaVimeoUrl : ''
  const hasUrl = url.length > 0
  const hasParent = data.fullLecture !== undefined && data.fullLecture !== null

  if (!hasUrl && !hasParent) {
    throw new ValidationError({
      errors: [
        {
          message:
            'A clip must reference a full lecture: provide either a Vimeo URL or pick an existing full lecture.',
          path: 'fullLecture',
        },
      ],
    })
  }

  // If both supplied, fullLecture wins — null out the URL.
  if (hasParent) {
    data.nirmalVidyaVimeoUrl = null
    return data
  }

  // hasUrl only: lookup-or-create the parent full lecture by URL.
  const existing = await req.payload.find({
    collection: 'lectures',
    where: {
      and: [{ type: { equals: 'full' } }, { nirmalVidyaVimeoUrl: { equals: url } }],
    },
    limit: 1,
    depth: 0,
    req,
  })

  let parentId: number
  if (existing.docs.length > 0) {
    parentId = existing.docs[0].id as number
  } else {
    try {
      const created = await req.payload.create({
        collection: 'lectures',
        data: { type: 'full', nirmalVidyaVimeoUrl: url },
        req,
      })
      parentId = created.id as number
    } catch (err) {
      // A concurrent clip create may have raced us to creating the parent;
      // populateFromNirmalaVidya rejects the duplicate. Re-find and reuse.
      const refind = await req.payload.find({
        collection: 'lectures',
        where: {
          and: [{ type: { equals: 'full' } }, { nirmalVidyaVimeoUrl: { equals: url } }],
        },
        limit: 1,
        depth: 0,
        req,
      })
      if (refind.docs.length === 0) throw err
      parentId = refind.docs[0].id as number
    }
  }

  data.fullLecture = parentId
  data.nirmalVidyaVimeoUrl = null
  return data
}

/**
 * beforeChange hook — create-only, runs only for `type === 'full'`. Fetches
 * the NV API once and packs the response into a single `metadata` JSON field.
 * The editor-visible `title` is auto-filled for the current request locale if
 * the editor didn't supply one; other locales fall back to it via Payload's
 * locale-fallback mechanism.
 *
 * Also enforces uniqueness of `nirmalVidyaVimeoUrl` across full lectures —
 * clips have their URL nulled by `resolveClipParent` before this hook runs,
 * so they don't collide.
 *
 * No thumbnail auto-upload — the editor `thumbnail` field is an optional
 * override now; the /api/lectures/for-audience endpoint falls back to
 * `metadata.thumbnailUrl`.
 */
export const populateFromNirmalaVidya: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  if (data.type !== 'full') return data

  const vimeoUrl = data.nirmalVidyaVimeoUrl as string | undefined
  if (!vimeoUrl) {
    throw new ValidationError({
      errors: [
        {
          message: 'A Vimeo URL is required for full lectures.',
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  const vimeoId = extractVimeoId(vimeoUrl)
  if (!vimeoId) {
    throw new ValidationError({
      errors: [
        {
          message:
            'Invalid Vimeo URL. Please enter a URL like https://vimeo.com/123456789 or https://player.vimeo.com/video/123456789',
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  // Reject duplicates — surface the existing record's admin URL so the editor
  // can navigate to it directly.
  const existing = await req.payload.find({
    collection: 'lectures',
    where: {
      and: [{ type: { equals: 'full' } }, { nirmalVidyaVimeoUrl: { equals: vimeoUrl } }],
    },
    limit: 1,
    depth: 0,
    req,
  })
  if (existing.docs.length > 0) {
    throw new ValidationError({
      errors: [
        {
          message: `A lecture with this URL already exists: /admin/collections/lectures/${existing.docs[0].id}`,
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  let videoData: NirmalaVidyaVideoData
  try {
    videoData = await fetchNirmalaVidyaVideo(vimeoId)
  } catch (error) {
    throw new ValidationError({
      errors: [
        {
          message: `Could not fetch lecture data from Nirmala Vidya: ${error instanceof Error ? error.message : 'Unknown error'}`,
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  const metadata = buildLectureMetadata(videoData)
  data.metadata = metadata

  // Auto-fill the editor-visible title for the current locale when blank.
  if (!data.title) {
    data.title = metadata.title
  }

  return data
}
