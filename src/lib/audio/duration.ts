import type { CollectionBeforeChangeHook } from 'payload'

import { parseBuffer, parseWebStream } from 'music-metadata'

interface ExtractAudioDurationOptions {
  /** Refuse audio longer than this. Omitted, any length is accepted. */
  maxMinutes?: number
}

type AudioSource =
  | { buffer: Buffer; mimeType?: string }
  | {
      stream: ReadableStream<Uint8Array>
      mimeType?: string
      /**
       * The stream's length in bytes, whenever the caller knows it. A
       * constant-bitrate MP3 with no Xing or Info header states its duration
       * only as size over bitrate, so a stream read without one answers
       * `undefined` for it (#1210). A buffer carries its own size.
       */
      size?: number
    }

/**
 * The length of `source` in whole seconds, or `undefined` when the container
 * states none. Throws when the bytes cannot be parsed as audio.
 *
 * A stream is read only as far as the format block, so a caller holding a
 * response body never has to download the rest of the track.
 */
export const readAudioDuration = async (source: AudioSource): Promise<number | undefined> => {
  const { format } =
    'buffer' in source
      ? await parseBuffer(source.buffer, { mimeType: source.mimeType })
      : await parseWebStream(source.stream, { mimeType: source.mimeType, size: source.size })
  return format.duration == null ? undefined : Math.round(format.duration)
}

/**
 * Factory for a `beforeChange` hook that stores an uploaded file's audio
 * duration, in whole seconds, on `data.duration`.
 *
 * Audio that cannot be parsed leaves the document unchanged and logs a warning
 * — metadata must not fail a save.
 */
export const extractAudioDuration =
  ({ maxMinutes }: ExtractAudioDurationOptions = {}): CollectionBeforeChangeHook =>
  async ({ data, req }) => {
    if (!req.file?.data) {
      return data
    }

    const buffer = Buffer.isBuffer(req.file.data) ? req.file.data : Buffer.from(req.file.data)

    let duration: number | undefined
    try {
      duration = await readAudioDuration({ buffer, mimeType: req.file.mimetype })
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

    if (maxMinutes != null && duration > maxMinutes * 60) {
      throw new Error(
        `Audio duration (${Math.round(duration / 60)} minutes) exceeds maximum of ${maxMinutes} minutes`,
      )
    }

    data.duration = duration
    return data
  }
