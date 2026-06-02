import type { CollectionBeforeChangeHook } from 'payload'

import { parseBuffer } from 'music-metadata'

const MAX_DURATION_MINUTES = 50

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
