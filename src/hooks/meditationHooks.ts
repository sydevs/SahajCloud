import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook, Where } from 'payload'

import { parseBuffer } from 'music-metadata'

const MAX_DURATION_MINUTES = 50

/**
 * beforeOperation hook that filters meditations by their `locale` select field.
 *
 * Unlike other collections that use PayloadCMS's field-level localization,
 * each meditation document belongs to a single locale via its `locale` field.
 * This hook adds a `where` clause to filter meditations by their locale
 * when `find` or `count` operations include a locale parameter.
 *
 * Skipped for:
 * - `findByID` operations (always return the specific document)
 * - `locale=all` requests (return all locales)
 * - Non-read operations (create, update, delete, etc.)
 */
export const filterMeditationsByLocale: CollectionBeforeOperationHook = ({ operation, args }) => {
  // Only filter find, count, and deprecated 'read' operations
  if (operation !== 'find' && operation !== 'count' && operation !== 'read') {
    return args
  }

  const locale = args.req?.locale

  // Skip filtering when locale is 'all' or not specified
  if (!locale || locale === 'all') {
    return args
  }

  // For deprecated 'read' operation, args could be find or findByID.
  // findByID args have an `id` property — skip filtering for those.
  if ('id' in args) {
    return args
  }

  // Build locale filter
  const localeFilter: Where = { locale: { equals: locale } }

  // Merge with existing where clause using AND logic
  const existingWhere = args.where
  if (existingWhere && Object.keys(existingWhere).length > 0) {
    args.where = {
      and: [existingWhere, localeFilter],
    }
  } else {
    args.where = localeFilter
  }

  return args
}

/**
 * beforeChange hook that extracts audio duration from uploaded files
 * using music-metadata's parseBuffer.
 *
 * Sets `data.duration` to the rounded duration in seconds.
 * Throws if the audio exceeds MAX_DURATION_MINUTES (50 minutes).
 */
export const extractAudioDuration: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (!req.file?.data) {
    return data
  }

  const buffer = Buffer.isBuffer(req.file.data) ? req.file.data : Buffer.from(req.file.data)

  let duration: number | undefined
  try {
    const metadata = await parseBuffer(buffer, { mimeType: req.file.mimetype })
    duration = metadata.format.duration
  } catch (error) {
    req.payload.logger.warn({
      msg: 'Failed to extract audio duration',
      filename: req.file.name,
      error: error instanceof Error ? error.message : String(error),
    })
    return data
  }

  if (duration == null) {
    return data
  }

  const maxSeconds = MAX_DURATION_MINUTES * 60
  if (duration > maxSeconds) {
    throw new Error(
      `Audio duration (${Math.round(duration / 60)} minutes) exceeds maximum of ${MAX_DURATION_MINUTES} minutes`,
    )
  }

  data.duration = Math.round(duration)
  return data
}
