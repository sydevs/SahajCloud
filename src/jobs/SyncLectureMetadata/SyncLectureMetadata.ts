import type { TaskConfig, Where } from 'payload'

import { buildLectureMetadata } from '@/lib/lectures/nirmalaVidya'
import { extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/lectures/nirmalaVidyaApi'

type SyncResult = {
  totalProcessed: number
  synced: number
  failed: number
  skippedNoVimeoId: number
}

type SyncLectureMetadataInput = {
  lectureIds?: number[]
}

const PAGINATION_LIMIT = 1000

/**
 * Monthly sync job — refreshes `lectures.metadata` from the Nirmala Vidya API.
 *
 * - Iterates non-trashed lectures (optionally filtered by `input.lectureIds`).
 * - For each lecture with a valid Vimeo URL, fetches NV data and writes the
 *   full metadata JSON (title, hlsUrl, thumbnailUrl, subtitles, lastSyncedAt).
 * - Per-lecture API failures are logged and counted; the batch continues.
 * - DB / config errors propagate, triggering the task-level retry.
 *
 * Manual trigger: `pnpm payload jobs:run --queue monthly`
 */
export const SyncLectureMetadata: TaskConfig<'syncLectureMetadata'> = {
  slug: 'syncLectureMetadata',
  label: 'Sync Lecture Metadata',
  retries: 2,
  inputSchema: [
    {
      name: 'lectureIds',
      type: 'json',
      required: false,
    },
  ],
  outputSchema: [
    { name: 'totalProcessed', type: 'number', required: true },
    { name: 'synced', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
    { name: 'skippedNoVimeoId', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 3 1 * *', // 1st of month at 03:00 UTC
      queue: 'monthly',
    },
  ],
  handler: async ({ req, input }) => {
    const result: SyncResult = {
      totalProcessed: 0,
      synced: 0,
      failed: 0,
      skippedNoVimeoId: 0,
    }

    const lectureIds = (input as SyncLectureMetadataInput | undefined)?.lectureIds
    // Only full lectures own NV `metadata`; clips reference their parent and
    // have `metadata: null` by design (#338).
    const where: Where =
      Array.isArray(lectureIds) && lectureIds.length > 0
        ? { and: [{ type: { equals: 'full' } }, { id: { in: lectureIds } }] }
        : { type: { equals: 'full' } }

    req.payload.logger.info({
      msg: 'Starting SyncLectureMetadata',
      scope: where ? `lectureIds[${lectureIds!.length}]` : 'all lectures',
    })

    let page = 1
    let hasNextPage = true

    while (hasNextPage) {
      const batch = await req.payload.find({
        collection: 'lectures',
        where,
        limit: PAGINATION_LIMIT,
        page,
        depth: 0,
      })

      for (const lecture of batch.docs) {
        result.totalProcessed++

        const vimeoUrl = lecture.nirmalVidyaVimeoUrl
        const vimeoId = typeof vimeoUrl === 'string' ? extractVimeoId(vimeoUrl) : null
        if (!vimeoId) {
          result.skippedNoVimeoId++
          req.payload.logger.warn({
            msg: 'SyncLectureMetadata: skipping lecture with missing/invalid Vimeo URL',
            lectureId: lecture.id,
            vimeoUrl,
          })
          continue
        }

        try {
          const videoData = await fetchNirmalaVidyaVideo(vimeoId)
          const metadata = buildLectureMetadata(videoData)

          await req.payload.update({
            collection: 'lectures',
            id: lecture.id,
            data: { metadata },
          })

          result.synced++
        } catch (error) {
          result.failed++
          req.payload.logger.warn({
            msg: 'SyncLectureMetadata: per-lecture failure — continuing batch',
            lectureId: lecture.id,
            vimeoId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      hasNextPage = batch.hasNextPage
      page++
    }

    req.payload.logger.info({ msg: 'SyncLectureMetadata complete', ...result })

    return { output: result }
  },
}
