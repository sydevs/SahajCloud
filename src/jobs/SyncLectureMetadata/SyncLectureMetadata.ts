import type { TaskConfig, Where } from 'payload'

import pMap from 'p-map'
import pRetry from 'p-retry'

import { buildLectureMetadata } from '@/lib/lectures/nirmalaVidya'
import { extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/lectures/nirmalaVidyaApi'

type SyncResult = {
  totalProcessed: number
  synced: number
  failed: number
  skippedNoVimeoId: number
}

const LECTURE_IDS_SCHEMA_URI = 'https://sahajcloud.dev/schemas/sync-lecture-metadata-ids.json'

const PAGINATION_LIMIT = 1000
const MAX_CONCURRENT_FETCHES = 10
// 1 initial attempt + 2 retries; exponential backoff (1s, 2s) with jitter.
const FETCH_RETRIES = 2

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
      // Optional narrowing for a manual run. The schema generates the input's
      // type, replacing a hand-written `SyncLectureMetadataInput` — it is not a
      // runtime check, so the handler still tests `Array.isArray` below.
      name: 'lectureIds',
      type: 'json',
      required: false,
      jsonSchema: {
        uri: LECTURE_IDS_SCHEMA_URI,
        fileMatch: [LECTURE_IDS_SCHEMA_URI],
        schema: {
          $id: LECTURE_IDS_SCHEMA_URI,
          title: 'SyncLectureMetadataIds',
          type: 'array',
          items: { type: 'integer' },
        },
      },
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

    const lectureIds = input?.lectureIds
    // Only full lectures own NV `metadata`; clips reference their parent and
    // have `metadata: null` by design (#338).
    const where: Where =
      Array.isArray(lectureIds) && lectureIds.length > 0
        ? { and: [{ type: { equals: 'full' } }, { id: { in: lectureIds } }] }
        : { type: { equals: 'full' } }

    req.payload.logger.info({
      msg: 'Starting SyncLectureMetadata',
      scope: where ? `lectureIds[${lectureIds!.length}]` : 'all lectures',
      maxConcurrentFetches: MAX_CONCURRENT_FETCHES,
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

      // Bounded-concurrency map over the batch (at most MAX_CONCURRENT_FETCHES
      // external calls in flight). `stopOnError: false` so one lecture's
      // permanent failure never aborts the monthly sweep.
      await pMap(
        batch.docs,
        async (lecture) => {
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
            return
          }

          try {
            const videoData = await pRetry(() => fetchNirmalaVidyaVideo(vimeoId), {
              retries: FETCH_RETRIES,
              factor: 2,
              minTimeout: 1000,
              randomize: true,
            })
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
              msg: 'SyncLectureMetadata: per-lecture failure after retries — continuing batch',
              lectureId: lecture.id,
              vimeoId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
        { concurrency: MAX_CONCURRENT_FETCHES, stopOnError: false },
      )

      hasNextPage = batch.hasNextPage
      page++
    }

    req.payload.logger.info({ msg: 'SyncLectureMetadata complete', ...result })

    return { output: result }
  },
}
