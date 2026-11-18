import type { Payload } from 'payload'

import { getR2Url } from '@/plugins/storage'

import { readAudioDuration } from './duration'

/** A stalled R2 transfer must not hang an operator's run for ever. */
const FETCH_TIMEOUT_MS = 60_000

interface SongRow {
  id: number
  title: string
}

export interface BackfillSongDurationsResult {
  written: (SongRow & { duration: number })[]
  skipped: (SongRow & { reason: string })[]
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
 * Re-runnable: a song that already holds a duration is never read or written.
 * A song whose audio cannot be read is reported and skipped, so one unreadable
 * file does not end the run.
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

  const result: BackfillSongDurationsResult = { written: [], skipped: [] }

  for (const doc of docs) {
    const row = { id: doc.id, title: doc.title }

    if (!doc.filename) {
      result.skipped.push({ ...row, reason: 'no audio file' })
      continue
    }

    const url = getR2Url(doc.filename)
    if (!url) throw new Error('CLOUDFLARE_R2_DELIVERY_URL is unset, so no song can be read.')

    let duration: number | undefined
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`fetch failed with ${response.status}`)
      if (!response.body) throw new Error('fetch answered with no body')
      duration = await readAudioDuration(
        response.body,
        response.headers.get('content-type') ?? undefined,
      )
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
