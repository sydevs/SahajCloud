import type { NirmalaVidyaVideoData } from '@/lib/lectures/nirmalaVidyaApi'
import type { LocaleCode } from '@/lib/locales'
import { languageToLocale } from '@/lib/locales'

// =============================================================================
// Language Code Mapping
// =============================================================================

/**
 * Maps a Nirmala Vidya API language code to a CMS locale code.
 * Returns null for unrecognized codes (silently skipped).
 */
export function apiLanguageToLocale(apiCode: string): LocaleCode | null {
  return languageToLocale(apiCode)
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
