import type { CollectionBeforeChangeHook } from 'payload'

import { parseBuffer } from 'music-metadata'

interface ExtractAudioDurationOptions {
  /** Refuse audio longer than this. Omitted, any length is accepted. */
  maxMinutes?: number
}

/**
 * Factory for a `beforeChange` hook that stores an uploaded file's audio
 * duration, in whole seconds, on `data.duration`.
 *
 * Audio whose length cannot be read clears the column and logs a warning —
 * metadata must not fail a save, and a kept value would describe the file this
 * upload replaces.
 *
 * The upload is parsed as a buffer, which carries its own size: a
 * constant-bitrate MP3 with no Xing or Info header states its length only as
 * size over bitrate, so a stream read without its size finds none (#1210).
 */
export const extractAudioDuration =
  ({ maxMinutes }: ExtractAudioDurationOptions = {}): CollectionBeforeChangeHook =>
  async ({ data, req }) => {
    if (!req.file?.data) {
      return data
    }

    let duration: number | undefined
    try {
      const { format } = await parseBuffer(req.file.data, { mimeType: req.file.mimetype })
      duration = format.duration == null ? undefined : Math.round(format.duration)
      if (duration == null) {
        req.payload.logger.warn({ msg: 'Audio states no duration', filename: req.file.name })
      }
    } catch (error) {
      req.payload.logger.warn({
        msg: 'Failed to extract audio duration',
        filename: req.file.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    if (duration == null) {
      data.duration = null
      return data
    }

    if (maxMinutes != null && duration > maxMinutes * 60) {
      throw new Error(
        `Audio duration (${Math.round(duration / 60)} minutes) exceeds maximum of ${maxMinutes} minutes`,
      )
    }

    data.duration = duration
    return data
  }
