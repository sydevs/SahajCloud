import type { Payload } from 'payload'

import { getR2Url } from '@/plugins/storage'

import { readAudioDuration } from './duration'

export interface SongDurationRow {
  id: number
  title: string
  /** Whole seconds read from the stored audio, absent when it could not be read. */
  duration?: number
  /** Why this song was left alone. */
  reason?: string
}

export interface BackfillSongDurationsResult {
  /** Songs holding no duration, trashed rows included. */
  scanned: number
  written: SongDurationRow[]
  skipped: SongDurationRow[]
}

interface BackfillSongDurationsOptions {
  /** Read and report without writing. */
  dryRun?: boolean
}

/**
 * Give every stored song a `duration`, read from the audio it already points
 * at. The upload hook fires on an upload alone, so a song stored before it
 * landed carries none.
 *
 * Re-runnable: a song that already holds a duration is never fetched or
 * written. A song whose audio cannot be read is reported and skipped, so one
 * unreadable file does not end the run.
 */
export const backfillSongDurations = async (
  payload: Payload,
  { dryRun = false }: BackfillSongDurationsOptions = {},
): Promise<BackfillSongDurationsResult> => {
  const { docs } = await payload.find({
    collection: 'songs',
    where: { duration: { exists: false } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    // A trashed song still holds its audio and can be restored, and a write
    // addressing one by id is refused without the flag.
    trash: true,
    select: { title: true, filename: true },
  })

  const result: BackfillSongDurationsResult = { scanned: docs.length, written: [], skipped: [] }

  for (const doc of docs) {
    const row: SongDurationRow = { id: doc.id, title: doc.title }

    const url = doc.filename ? getR2Url(doc.filename) : undefined
    if (!url) {
      result.skipped.push({ ...row, reason: doc.filename ? 'no R2 delivery URL' : 'no audio file' })
      continue
    }

    let duration: number | undefined
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`fetch failed with ${response.status}`)
      duration = await readAudioDuration(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      result.skipped.push({
        ...row,
        reason: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    if (duration == null) {
      result.skipped.push({ ...row, reason: 'audio states no duration' })
      continue
    }

    if (!dryRun) {
      await payload.update({
        collection: 'songs',
        id: doc.id,
        data: { duration },
        overrideAccess: true,
        trash: true,
      })
    }

    result.written.push({ ...row, duration })
  }

  return result
}
