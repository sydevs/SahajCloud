import type { Payload } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LectureMetadata } from '@/hooks/lectureHooks'
import type { Lecture } from '@/payload-types'

import { SyncLectureMetadata } from '@/jobs/tasks/SyncLectureMetadata'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
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
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
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
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
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
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')

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
})
