import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import type { NirmalaVidyaVideoData } from '@/lib/lectures/nirmalaVidyaApi'
import type { LocaleCode } from '@/lib/locales'
import { isValidLocale, LOCALES } from '@/lib/locales'
import type { Lecture } from '@/payload-types'

// =============================================================================
// Language Code Mapping
// =============================================================================

/**
 * Maps a Nirmala Vidya API language code to a CMS locale code.
 * Returns null for unrecognized codes (silently skipped).
 */
export function apiLanguageToLocale(apiCode: string): LocaleCode | null {
  if (isValidLocale(apiCode)) return apiCode
  // Normalize to BCP-47 shape: lowercase language subtag, uppercase region
  // subtag (e.g. 'pt_BR' / 'pt-br' -> 'pt-BR'), so a lowercased region no
  // longer collides with the old invalid 'pt-br' spelling.
  const [language, region] = apiCode.replace('_', '-').split('-')
  const normalized = region
    ? `${language.toLowerCase()}-${region.toUpperCase()}`
    : language.toLowerCase()
  if (isValidLocale(normalized)) return normalized
  // Special case: API may use 'pt' for Brazilian Portuguese
  if (normalized === 'pt') return 'pt-BR'
  return null
}

// =============================================================================
// Metadata Shape
// =============================================================================

export const LECTURE_METADATA_SCHEMA_URI = 'https://sahajcloud.dev/schemas/lecture-metadata.json'

/**
 * Shape stored in `Lectures.metadata`. All NV-sourced data is bundled here so
 * the /api/lectures/for-audience response can expose the full subtitle map and
 * the monthly sync task can refresh everything in one write.
 *
 * Wired onto the column as its `jsonSchema`, so Payload generates the
 * TypeScript type AND rejects a write it does not describe. `buildLectureMetadata`
 * below is the only writer — the create-time hook and the monthly sync task both
 * call it — which is what makes `additionalProperties: false` safe here.
 *
 * Every key is optional on purpose. Payload validates this column on *every*
 * save of a lecture, including one that never touched it, so requiring a key
 * would make a row written under an earlier shape unsaveable.
 *
 * The subtitle map is keyed by CMS locale code, taken from `LOCALES` rather than
 * re-listed, so adding a locale cannot leave the two out of step.
 */
export const lectureMetadataJsonSchema: JSONSchema4 = {
  $id: LECTURE_METADATA_SCHEMA_URI,
  title: 'LectureMetadata',
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    thumbnailUrl: { type: ['string', 'null'] },
    hlsUrl: { type: 'string' },
    subtitles: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        LOCALES.map((locale) => [locale.code, { type: 'string' }]),
      ) as Record<string, JSONSchema4>,
      description: 'Subtitle track URL per CMS locale, from the NV API language codes.',
    },
    duration: { type: ['number', 'null'] },
    lastSyncedAt: { type: 'string' },
  },
}

/** The field-level wrapper Payload wants — see `Lectures.metadata`. */
export const lectureMetadataFieldSchema: JSONField['jsonSchema'] = {
  uri: LECTURE_METADATA_SCHEMA_URI,
  fileMatch: [LECTURE_METADATA_SCHEMA_URI],
  schema: lectureMetadataJsonSchema,
}

/**
 * The stored shape, taken from the generated types rather than restated here.
 * `lectureMetadataJsonSchema` above is what produces it.
 */
export type LectureMetadata = NonNullable<Lecture['metadata']>

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
