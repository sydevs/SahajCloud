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
const MAX_CONCURRENT_FETCHES = 10

/**
 * Simple semaphore for bounding concurrent operations. Tracks in-flight
 * promises and queues new work until a slot is available.
 */
class SimpleSemaphore {
  private currentCount = 0

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    while (this.currentCount >= this.maxConcurrent) {
      // Spin briefly, allowing other microtasks to complete
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    this.currentCount++
  }

  release(): void {
    this.currentCount--
  }
}

/**
 * Retry with exponential backoff + jitter. Retries up to `maxAttempts` times
 * with delay = baseDelayMs * (2 ^ attemptNum) + random jitter.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // On last attempt, don't delay
      if (attempt < maxAttempts - 1) {
        // Exponential backoff: delay = baseDelayMs * 2^attempt
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt)
        // Add jitter: ±25% random factor
        const jitter = exponentialDelay * (0.75 + Math.random() * 0.5)
        await new Promise((resolve) => setTimeout(resolve, jitter))
      }
    }
  }

  // All retries exhausted; throw the last error
  throw lastError
}

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
      maxConcurrentFetches: MAX_CONCURRENT_FETCHES,
    })

    const semaphore = new SimpleSemaphore(MAX_CONCURRENT_FETCHES)

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

      // Process batch with bounded concurrency via semaphore
      const promises = batch.docs.map(async (lecture) => {
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

        await semaphore.acquire()
        try {
          const videoData = await retryWithBackoff(
            () => fetchNirmalaVidyaVideo(vimeoId),
            3, // maxAttempts
            1000, // baseDelayMs
          )
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
        } finally {
          semaphore.release()
        }
      })

      await Promise.all(promises)

      hasNextPage = batch.hasNextPage
      page++
    }

    req.payload.logger.info({ msg: 'SyncLectureMetadata complete', ...result })

    return { output: result }
  },
}
