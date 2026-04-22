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
    lastSyncedAt: new Date().toISOString(),
  }
}

// =============================================================================
// beforeChange Hook
// =============================================================================

/**
 * beforeChange hook — create-only. Fetches the NV API once and packs the
 * response into a single `metadata` JSON field. The editor-visible `title` is
 * auto-filled for the current request locale if the editor didn't supply one;
 * other locales fall back to it via Payload's locale-fallback mechanism.
 *
 * No thumbnail auto-upload — the editor `thumbnail` field is an optional
 * override now; the viewer endpoint falls back to `metadata.thumbnailUrl`.
 */
export const populateFromNirmalaVidya: CollectionBeforeChangeHook = async ({
  data,
  operation,
}) => {
  if (operation !== 'create') return data

  const vimeoUrl = data.nirmalVidyaVimeoUrl as string | undefined
  if (!vimeoUrl) return data

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
