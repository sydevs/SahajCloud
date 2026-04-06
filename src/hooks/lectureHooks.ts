import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import type { LocaleCode } from '@/lib/locales'

import { downloadToBuffer, extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/nirmalaVidyaApi'
import { isValidLocale } from '@/lib/locales'

// =============================================================================
// Language Code Mapping
// =============================================================================

/**
 * Maps a Nirmala Vidya API language code to a CMS locale code.
 * Returns null for unrecognized codes (silently skipped).
 */
function apiLanguageToLocale(apiCode: string): LocaleCode | null {
  if (isValidLocale(apiCode)) return apiCode
  // Normalize: lowercase and replace underscores with hyphens
  const normalized = apiCode.toLowerCase().replace('_', '-')
  if (isValidLocale(normalized)) return normalized
  // Special case: API may use 'pt' for Brazilian Portuguese
  if (normalized === 'pt') return 'pt-br'
  return null
}

// =============================================================================
// beforeChange Hook
// =============================================================================

/**
 * beforeChange hook that auto-populates lecture fields from the Nirmala Vidya API.
 *
 * Only runs on 'create' operations. On 'update', the hook is a no-op.
 *
 * On create:
 * 1. Extracts the Vimeo ID from `data.nirmalVidyaVimeoUrl`
 * 2. Fetches video metadata from the Nirmala Vidya API
 * 3. Downloads the thumbnail and creates an Images document
 * 4. Populates title, videoUrl, thumbnail, and current-locale subtitlesUrl
 * 5. Stashes subtitle map in req.context for the afterChange hook
 */
export const populateFromNirmalaVidya: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
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

  let videoData
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

  // Use user-provided title if available, otherwise use the API value
  if (!data.title) {
    data.title = videoData.title
  }

  data.videoUrl = videoData.hlsUrl

  // Download and upload thumbnail as an Images document
  if (videoData.thumbnailUrl) {
    try {
      const thumbnailBuffer = await downloadToBuffer(
        videoData.thumbnailUrl,
        `lecture-thumbnail-${vimeoId}.jpg`,
      )
      const thumbnailImage = await req.payload.create({
        collection: 'images',
        data: { alt: data.title || videoData.title },
        file: thumbnailBuffer,
        req,
      })
      data.thumbnail = thumbnailImage.id
    } catch (thumbError) {
      req.payload.logger.warn({
        msg: 'Failed to auto-download lecture thumbnail — continuing without thumbnail',
        vimeoId,
        error: thumbError instanceof Error ? thumbError.message : String(thumbError),
      })
    }
  }

  // Map subtitles to CMS locales
  const subtitlesByLocale: Partial<Record<LocaleCode, string>> = {}
  for (const subtitle of videoData.subtitles) {
    const locale = apiLanguageToLocale(subtitle.languageCode)
    if (locale) {
      subtitlesByLocale[locale] = subtitle.url
    }
  }

  // Set subtitle URL for the current request locale (beforeChange can only set one locale)
  const currentLocale = (req.locale || 'en') as LocaleCode
  if (subtitlesByLocale[currentLocale]) {
    data.subtitlesUrl = subtitlesByLocale[currentLocale]
  }

  // Stash the full map for the afterChange hook to populate other locales
  req.context.subtitlesByLocale = subtitlesByLocale

  return data
}

// =============================================================================
// afterChange Hook
// =============================================================================

/**
 * afterChange hook that populates subtitlesUrl for non-current locales.
 *
 * Reads the subtitle map stashed by `populateFromNirmalaVidya` in req.context
 * and calls `payload.update()` for each locale that has a subtitle URL.
 * Each update is non-fatal — failures are logged as warnings.
 */
export const populateSubtitleLocales: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc

  const subtitlesByLocale = req.context.subtitlesByLocale as
    | Partial<Record<LocaleCode, string>>
    | undefined

  if (!subtitlesByLocale || Object.keys(subtitlesByLocale).length === 0) return doc

  const currentLocale = (req.locale || 'en') as LocaleCode

  // Update each non-current locale that has a subtitle URL
  const updates = Object.entries(subtitlesByLocale)
    .filter(([locale]) => locale !== currentLocale)
    .map(([locale, url]) =>
      req.payload
        .update({
          collection: 'lectures',
          id: doc.id,
          locale: locale as LocaleCode,
          data: { subtitlesUrl: url },
          req,
        })
        .catch((error) => {
          req.payload.logger.warn({
            msg: `Failed to set subtitle URL for locale ${locale}`,
            lectureId: doc.id,
            locale,
            error: error instanceof Error ? error.message : String(error),
          })
        }),
    )

  await Promise.all(updates)

  return doc
}
