import type { Payload } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncLectureMetadata } from '@/jobs/SyncLectureMetadata/SyncLectureMetadata'
import type { LectureMetadata } from '@/lib/lectures/nirmalaVidya'
import type { Lecture } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

vi.mock('@/lib/lectures/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/lectures/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Initial Title',
      thumbnailUrl: 'https://example.com/initial-thumb.jpg',
      hlsUrl: 'https://example.com/initial-stream.m3u8',
      subtitles: [{ languageCode: 'en', url: 'https://example.com/initial-en.vtt' }],
      duration: null,
    }),
  }
})

type SyncOutput = {
  totalProcessed: number
  synced: number
  failed: number
  skippedNoVimeoId: number
}

async function runTask(payload: Payload, input?: { lectureIds?: number[] }): Promise<SyncOutput> {
  const req = {
    payload,
    context: {},
    headers: new Headers(),
  } as Parameters<typeof SyncLectureMetadata.handler>[0]['req']

  const result = await SyncLectureMetadata.handler({
    req,
    input: input ?? {},
    job: {} as Parameters<typeof SyncLectureMetadata.handler>[0]['job'],
    tasks: {} as Parameters<typeof SyncLectureMetadata.handler>[0]['tasks'],
    inlineTask: (() => {}) as Parameters<typeof SyncLectureMetadata.handler>[0]['inlineTask'],
  })
  return result.output as SyncOutput
}

describe('SyncLectureMetadata task', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(async () => {
    // Reset the shared mock between tests so per-test `mockResolvedValueOnce`
    // calls are not consumed by the previous test's lectures.
    const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
    vi.mocked(fetchNirmalaVidyaVideo).mockReset()
    vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValue({
      title: 'Default Fresh Title',
      thumbnailUrl: 'https://example.com/default-thumb.jpg',
      hlsUrl: 'https://example.com/default-stream.m3u8',
      subtitles: [],
      duration: null,
    })
  })

  it('refreshes metadata for the targeted lectures and bumps lastSyncedAt', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')
    vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
      title: 'Original',
      thumbnailUrl: 'https://example.com/orig.jpg',
      hlsUrl: 'https://example.com/orig.m3u8',
      subtitles: [{ languageCode: 'en', url: 'https://example.com/orig-en.vtt' }],
      duration: 600,
    })

    const lecture = await testData.createLecture(payload)
    const original = lecture.metadata as LectureMetadata
    const originalSyncedAt = original.lastSyncedAt

    // Force a meaningful time gap so we can assert lastSyncedAt moved.
    await new Promise((r) => setTimeout(r, 10))

    vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
      title: 'Refreshed',
      thumbnailUrl: 'https://example.com/refreshed.jpg',
      hlsUrl: 'https://example.com/refreshed.m3u8',
      subtitles: [
        { languageCode: 'en', url: 'https://example.com/refreshed-en.vtt' },
        { languageCode: 'ru', url: 'https://example.com/refreshed-ru.vtt' },
      ],
      duration: 2400,
    })

    const output = await runTask(payload, { lectureIds: [lecture.id] })
    expect(output).toEqual({
      totalProcessed: 1,
      synced: 1,
      failed: 0,
      skippedNoVimeoId: 0,
    })

    const refreshed = (await payload.findByID({
      collection: 'lectures',
      id: lecture.id,
    })) as Lecture
    const metadata = refreshed.metadata as LectureMetadata
    expect(metadata.title).toBe('Refreshed')
    expect(metadata.hlsUrl).toBe('https://example.com/refreshed.m3u8')
    expect(metadata.subtitles).toEqual({
      en: 'https://example.com/refreshed-en.vtt',
      ru: 'https://example.com/refreshed-ru.vtt',
    })
    expect(metadata.duration).toBe(2400)
    expect(new Date(metadata.lastSyncedAt).getTime()).toBeGreaterThan(
      new Date(originalSyncedAt).getTime(),
    )
  })

  it('continues the batch when a single lecture fails at the API', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')

    const lectureOk1 = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/10000001',
    })
    const lectureFails = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/10000002',
    })
    const lectureOk2 = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/10000003',
    })

    // Mid-batch API failure — task should log warn + continue, not throw.
    const fetchImpl = async (vimeoId: string) => {
      if (vimeoId === '10000002') throw new Error('simulated API failure')
      return {
        title: `t-${vimeoId}`,
        thumbnailUrl: null,
        hlsUrl: `https://example.com/${vimeoId}.m3u8`,
        subtitles: [] as Array<{ languageCode: string; url: string }>,
        duration: null,
      }
    }
    vi.mocked(fetchNirmalaVidyaVideo).mockImplementation(fetchImpl)

    const output = await runTask(payload, {
      lectureIds: [lectureOk1.id, lectureFails.id, lectureOk2.id],
    })

    expect(output.totalProcessed).toBe(3)
    expect(output.synced).toBe(2)
    expect(output.failed).toBe(1)
    expect(output.skippedNoVimeoId).toBe(0)

    const ok1 = (await payload.findByID({
      collection: 'lectures',
      id: lectureOk1.id,
    })) as Lecture
    expect((ok1.metadata as LectureMetadata).hlsUrl).toBe('https://example.com/10000001.m3u8')

    const ok2 = (await payload.findByID({
      collection: 'lectures',
      id: lectureOk2.id,
    })) as Lecture
    expect((ok2.metadata as LectureMetadata).hlsUrl).toBe('https://example.com/10000003.m3u8')
  })

  it('filters the batch by input.lectureIds', async () => {
    const lectureA = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/20000001',
    })
    const lectureB = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/20000002',
    })

    const output = await runTask(payload, { lectureIds: [lectureA.id] })
    // totalProcessed may include other lectures created in earlier tests if no
    // filter were applied; with the filter we expect exactly 1.
    expect(output.totalProcessed).toBe(1)
    expect(output.synced).toBe(1)
    void lectureB
  })

  it('skips clip-type lectures (only full lectures own metadata)', async () => {
    // Create a full parent + a clip pointing at it.
    const parent = await testData.createLecture(payload)
    const clip = await testData.createLectureExcerpt(payload, { fullLecture: parent.id })

    const output = await runTask(payload, { lectureIds: [parent.id, clip.id] })
    // Only the full lecture is processed; the clip is filtered out by the
    // task's `where.type: { equals: 'full' }` clause.
    expect(output.totalProcessed).toBe(1)
    expect(output.synced).toBe(1)
    expect(output.failed).toBe(0)

    // Clip's metadata stays null (it has none).
    const clipFresh = (await payload.findByID({
      collection: 'lectures',
      id: clip.id,
    })) as Lecture
    expect(clipFresh.metadata).toBeFalsy()
  })

  it('counts lectures with an invalid Vimeo URL under skippedNoVimeoId', async () => {
    // Creating via testData.createLecture requires a valid URL (the hook
    // rejects invalid URLs at create time). To set up this state we bypass
    // the create hook by using `db` path — instead, mutate after create.
    const lecture = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/30000001',
    })
    // Direct DB-level override: the `access.update: () => false` rule blocks
    // external updates, but the internal payload.update is gated by the same
    // access layer. We step around by updating via `overrideAccess`:
    await payload.update({
      collection: 'lectures',
      id: lecture.id,
      data: { nirmalVidyaVimeoUrl: 'https://youtube.com/not-a-vimeo' },
      overrideAccess: true,
    })

    const output = await runTask(payload, { lectureIds: [lecture.id] })
    expect(output.totalProcessed).toBe(1)
    expect(output.skippedNoVimeoId).toBe(1)
    expect(output.synced).toBe(0)
    expect(output.failed).toBe(0)
  })

  it('retries transient failures with exponential backoff', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')

    const lecture = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/50000001',
    })

    // Mock transient failure on first attempt, success on retry
    let callCount = 0
    vi.mocked(fetchNirmalaVidyaVideo).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // First call: timeout (transient failure)
        throw new Error('Request timed out after 15000ms')
      }
      // Second call (retry): success
      return {
        title: 'Recovered Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/video.m3u8',
        subtitles: [],
        duration: null,
      }
    })

    const output = await runTask(payload, { lectureIds: [lecture.id] })

    // Verify the retry succeeded (synced count > 0)
    expect(output.synced).toBeGreaterThanOrEqual(1)
    expect(output.failed).toBe(0)

    // Verify it was retried (callCount > 1)
    expect(callCount).toBeGreaterThan(1)
  })

  it('exhausts retries and logs permanent failure without aborting batch', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')

    const lectureOk = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/60000001',
    })
    const lectureFail = await testData.createLecture(payload, undefined, {
      nirmalVidyaVimeoUrl: 'https://vimeo.com/60000002',
    })

    let failCount = 0
    vi.mocked(fetchNirmalaVidyaVideo).mockImplementation(async (vimeoId: string) => {
      // Always fail for lectureFail
      if (vimeoId === '60000002') {
        failCount++
        throw new Error('Permanent API failure (e.g., 401 Unauthorized)')
      }
      // Succeed for lectureOk
      return {
        title: 'OK Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/video.m3u8',
        subtitles: [],
        duration: null,
      }
    })

    const output = await runTask(payload, {
      lectureIds: [lectureOk.id, lectureFail.id],
    })

    // Expect the batch to complete: OK synced, Fail counted as failed
    expect(output.totalProcessed).toBe(2)
    expect(output.synced).toBe(1)
    expect(output.failed).toBe(1)

    // Verify retry was attempted (3 attempts max)
    expect(failCount).toBe(3)
  })

  it('processes lectures with bounded concurrency', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/lectures/nirmalaVidyaApi')

    // Create multiple lectures to exercise concurrency
    const lectureCount = 20
    const lectureIds: number[] = []
    for (let i = 0; i < lectureCount; i++) {
      const lecture = await testData.createLecture(payload, undefined, {
        nirmalVidyaVimeoUrl: `https://vimeo.com/${70000000 + i}`,
      })
      lectureIds.push(lecture.id)
    }

    // Track concurrent calls
    let maxConcurrent = 0
    let currentConcurrent = 0
    const delays: number[] = []

    vi.mocked(fetchNirmalaVidyaVideo).mockImplementation(async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)

      // Simulate API call with minimal delay
      await new Promise((resolve) => setTimeout(resolve, 5))

      currentConcurrent--
      return {
        title: 'Test',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/video.m3u8',
        subtitles: [],
        duration: null,
      }
    })

    const output = await runTask(payload, { lectureIds })

    // Verify all were synced
    expect(output.synced).toBe(lectureCount)
    expect(output.failed).toBe(0)

    // Verify bounded concurrency was enforced: max should be <= 10
    expect(maxConcurrent).toBeLessThanOrEqual(10)
    expect(maxConcurrent).toBeGreaterThan(1) // At least some parallelism
  })
})
