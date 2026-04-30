/**
 * Integration tests for the WeMeditate seed importer's lectures flow.
 *
 * After #330 the importer creates one Lecture per unique vimeo_id (no
 * separate clip child). Coverage:
 *   1. importLectures() upserts a Lecture per vimeo_id; the parent's
 *      `metadata.duration` flows in from the NV API.
 *   2. Re-running is a flat-counts no-op in skip mode.
 *   3. NV API errors are isolated per vimeo_id — one bad video doesn't kill
 *      the run; the failing id is just absent from `lectureMap`.
 */

import type { Payload } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API — same pattern as tests/int/lectures.int.spec.ts.
// The populateFromNirmalaVidya hook on Lectures hits this on every create;
// without the mock the test would try to dial mapi.nirmalavidya.org for real.
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Default Mocked NV Title',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      hlsUrl: 'https://example.com/stream.m3u8',
      subtitles: [],
      duration: 600,
    }),
  }
})

// Lazy-require the importer so the NV API mock is in place before the
// importer's transitive imports resolve.
async function buildTestImporter(payload: Payload) {
  const { WeMeditateImporter } = await import('../../seeds/wemeditate/import')
  const { Logger } = await import('../../seeds/lib/logger')
  const { FileUtils } = await import('../../seeds/lib/fileUtils')
  const { ValidationReport } = await import('../../seeds/lib/validationReport')

  /**
   * Subclass exposing the private import surface for direct invocation.
   * Avoids running the full lifecycle (data.json load, media downloader
   * setup, song-tags preload, etc.) — none of which the lecture path needs.
   */
  class TestImporter extends WeMeditateImporter {
    async injectAndImportLectures(data: unknown): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).data = data
      // Mirror the live preloads from setup() so skip-mode re-runs work.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const self = this as any
      await self.preloadCollection('lectures', 'nirmalVidyaVimeoUrl', ['metadata', 'title'])
      await self.importLectures()
    }

    getLectureMap(): Map<string, number | string> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this as any).idMaps.lectures
    }

    resetPreloadCache(): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).preloadCache = new Map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).idMaps.lectures = new Map()
    }
  }

  const importer = new TestImporter({
    dryRun: false,
    clearCache: false,
    payload,
  })

  // Manually wire the runtime fields that BaseImporter.run() would have set.
  // We're intentionally bypassing run() since it would also kick off the
  // unrelated import phases (authors / albums / pages / etc.).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const importerAny = importer as any
  importerAny.logger = new Logger()
  importerAny.fileUtils = new FileUtils(importerAny.logger)
  importerAny.report = new ValidationReport()
  importerAny.payload = payload

  return importer
}

/**
 * Builds a synthetic `data.json`-shaped object with `vimeo` blocks for the
 * given vimeo_ids. Mirrors the actual nested wemeditate shape:
 *   { type: 'vimeo', data: { items: [{ vimeo_id, title }] } }
 */
function buildSyntheticData(
  blocks: Array<{ vimeoId?: string; youtubeId?: string; title?: string }>,
) {
  return {
    staticPages: [
      {
        id: 1,
        translations: [
          {
            locale: 'en',
            content: JSON.stringify({
              blocks: blocks.map((b, i) => ({
                id: `block-${i}`,
                type: 'vimeo',
                data: {
                  items: [
                    {
                      vimeo_id: b.vimeoId,
                      youtube_id: b.youtubeId,
                      title: b.title || '',
                    },
                  ],
                },
              })),
            }),
          },
        ],
      },
    ],
    articles: [],
    subtleSystemNodes: [],
    treatments: [],
  }
}

describe('Seed: importLectures', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(async () => {
    // Reset the default mock between tests so per-case overrides don't leak.
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
    vi.mocked(fetchNirmalaVidyaVideo).mockReset()
    vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValue({
      title: 'Default Mocked NV Title',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      hlsUrl: 'https://example.com/stream.m3u8',
      subtitles: [],
      duration: 600,
    })
  })

  it('upserts a Lecture per unique vimeo_id and stores metadata.duration', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
    vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
      title: 'NV Title For 111',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      hlsUrl: 'https://example.com/stream.m3u8',
      subtitles: [],
      duration: 1234,
    })

    const importer = await buildTestImporter(payload)
    await importer.injectAndImportLectures(
      buildSyntheticData([{ vimeoId: '111', title: 'Legacy Block Title' }]),
    )

    const lectures = await payload.find({
      collection: 'lectures',
      where: { nirmalVidyaVimeoUrl: { equals: 'https://vimeo.com/111' } },
    })
    expect(lectures.docs.length).toBe(1)
    const lecture = lectures.docs[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((lecture.metadata as any)?.duration).toBe(1234)

    // The map the converter consumes should hold the *lecture* id.
    expect(importer.getLectureMap().get('111')).toBe(lecture.id)
  })

  it('re-running is a no-op in skip mode (counts unchanged, no duplicate NV calls)', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')

    const data = buildSyntheticData([{ vimeoId: '222', title: 'Once' }])

    // First run — creates the lecture (and fires the NV hook).
    const importer1 = await buildTestImporter(payload)
    await importer1.injectAndImportLectures(data)

    const callsAfterFirst = vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1)

    const lecturesAfterFirst = await payload.count({
      collection: 'lectures',
      where: { nirmalVidyaVimeoUrl: { equals: 'https://vimeo.com/222' } },
    })
    expect(lecturesAfterFirst.totalDocs).toBe(1)

    // Second run — fresh importer instance picks up the existing lecture via preload.
    // The NV hook only fires on create; the existing lecture should be skipped, not re-fetched.
    const importer2 = await buildTestImporter(payload)
    await importer2.injectAndImportLectures(data)

    const callsAfterSecond = vi.mocked(fetchNirmalaVidyaVideo).mock.calls.length
    expect(callsAfterSecond).toBe(callsAfterFirst) // Hook didn't re-fire.

    const lecturesAfterSecond = await payload.count({
      collection: 'lectures',
      where: { nirmalVidyaVimeoUrl: { equals: 'https://vimeo.com/222' } },
    })
    expect(lecturesAfterSecond.totalDocs).toBe(1)

    // Map still resolves on the second run (looked up from existing lecture).
    expect(importer2.getLectureMap().get('222')).toBeDefined()
  })

  it('isolates per-vimeo errors — one NV failure does not abort the rest of the batch', async () => {
    const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')

    // Order matches the order of unique vimeo_ids encountered in source data.
    // First call: succeeds (333). Second: fails (444). Third: succeeds (555).
    vi.mocked(fetchNirmalaVidyaVideo)
      .mockResolvedValueOnce({
        title: 'NV Title 333',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
        duration: 300,
      })
      .mockRejectedValueOnce(new Error('NV API: 404 video not found'))
      .mockResolvedValueOnce({
        title: 'NV Title 555',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        hlsUrl: 'https://example.com/stream.m3u8',
        subtitles: [],
        duration: 500,
      })

    const importer = await buildTestImporter(payload)
    await importer.injectAndImportLectures(
      buildSyntheticData([
        { vimeoId: '333', title: 'A' },
        { vimeoId: '444', title: 'B' },
        { vimeoId: '555', title: 'C' },
      ]),
    )

    const map = importer.getLectureMap()
    expect(map.get('333')).toBeDefined()
    expect(map.has('444')).toBe(false) // Failed id absent — converter will warn.
    expect(map.get('555')).toBeDefined()

    const lectures = await payload.find({
      collection: 'lectures',
      where: {
        nirmalVidyaVimeoUrl: {
          in: ['https://vimeo.com/333', 'https://vimeo.com/444', 'https://vimeo.com/555'],
        },
      },
    })
    const urls = lectures.docs.map((d) => d.nirmalVidyaVimeoUrl).sort()
    expect(urls).toEqual(['https://vimeo.com/333', 'https://vimeo.com/555'])
  })
})
