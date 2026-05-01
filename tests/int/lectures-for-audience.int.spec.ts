import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Audience, Client, Image, Lecture } from '@/payload-types'

import { lecturesForAudience } from '@/endpoints/lecturesForAudience'
import type { LecturePlayerData } from '@/lib/lectureShape'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Prevent live Nirmala Vidya API calls from the populateFromNirmalaVidya hook
// fired by testData.createLecture. Each test can override the mock response.
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/metadata-thumb.jpg',
      hlsUrl: 'https://example.com/stream.m3u8',
      subtitles: [
        { languageCode: 'en', url: 'https://example.com/parent-en.vtt' },
        { languageCode: 'es', url: 'https://example.com/parent-es.vtt' },
      ],
      duration: null,
    }),
  }
})

// All audience params are required by the endpoint's Zod schema. Tests that
// don't exercise a specific param still need to pass neutral defaults; only
// the 400-validation cases should call with `{ skipAudienceDefaults: true }`
// to omit them and exercise the "missing required param" path.
const AUDIENCE_DEFAULTS = {
  pathProgress: 0,
  meditationsPerWeek: 0,
  totalMeditationsViewed: 0,
  totalLecturesViewed: 0,
}

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  user?: { id: number | string; collection: string },
  options: { skipAudienceDefaults?: boolean } = {},
): Promise<{ status: number; body: { docs: LecturePlayerData[] } | unknown }> {
  const finalQuery = options.skipAudienceDefaults
    ? query
    : { ...AUDIENCE_DEFAULTS, ...query }
  const req = {
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: {},
    user,
  } as unknown as PayloadRequest

  const response = (await lecturesForAudience.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('lecturesForAudience endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let audienceBeginner: Audience
  let audienceIntermediate: Audience

  let lectureBeginnerOnly: Lecture
  let lectureIntermediateOnly: Lecture
  let lectureNoAudience: Lecture
  let lectureMultiAudience: Lecture
  let lectureAllFailingAudiences: Lecture
  let excerptOfBeginner: Lecture // Lecture with fullLecture + startTime/stopTime
  let excerptOfIntermediate: Lecture
  let lectureWithSubtitleOverride: Lecture

  let editorThumbnailImage: Image

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    audienceBeginner = await testData.createAudience(payload, {
      label: 'Beginner',
      rules: { logic: 'AND', pathProgress: { min: 0, max: 5 } },
    })
    audienceIntermediate = await testData.createAudience(payload, {
      label: 'Intermediate',
      rules: { logic: 'AND', pathProgress: { min: 5, max: 10 } },
    })

    editorThumbnailImage = (await testData.createMediaImage(payload, {
      alt: 'Editor override',
    })) as Image

    // lectureBeginnerOnly has an editor thumbnail override.
    lectureBeginnerOnly = await testData.createLecture(
      payload,
      { thumbnail: editorThumbnailImage.id },
      { title: 'Beginner Lecture', audiences: [audienceBeginner.id] },
    )
    // No editor override; falls back to metadata.thumbnailUrl.
    lectureIntermediateOnly = await testData.createLecture(
      payload,
      {},
      { title: 'Intermediate Lecture', audiences: [audienceIntermediate.id] },
    )
    lectureNoAudience = await testData.createLecture(
      payload,
      {},
      { title: 'No Audience Lecture', audiences: [] },
    )

    // OR-match: passes when ANY attached audience matches.
    lectureMultiAudience = await testData.createLecture(
      payload,
      {},
      {
        title: 'Multi Audience Lecture',
        audiences: [audienceBeginner.id, audienceIntermediate.id],
      },
    )

    // OR-match: should be excluded for pathProgress=3 (Intermediate fails).
    lectureAllFailingAudiences = await testData.createLecture(
      payload,
      {},
      {
        title: 'All Failing Audiences Lecture',
        audiences: [audienceIntermediate.id],
      },
    )

    // Excerpt = lecture pointing at a parent via `fullLecture`. Same uniform
    // response shape as a full lecture; carries its own metadata via NV API.
    excerptOfBeginner = await testData.createLectureExcerpt(
      payload,
      { fullLecture: lectureBeginnerOnly.id },
      {
        title: 'Excerpt of Beginner Lecture',
        audiences: [audienceBeginner.id],
        startTime: 30,
        stopTime: 150,
      },
    )

    // Excerpt whose parent is itself NOT audience-eligible — should still
    // surface (parent eligibility doesn't affect excerpt eligibility).
    excerptOfIntermediate = await testData.createLectureExcerpt(
      payload,
      { fullLecture: lectureIntermediateOnly.id },
      {
        title: 'Excerpt of Intermediate Lecture',
        audiences: [audienceBeginner.id],
        startTime: 0,
        stopTime: 60,
      },
    )

    // Lecture with a per-locale subtitle override on top of metadata.subtitles.
    lectureWithSubtitleOverride = await testData.createLecture(
      payload,
      {},
      {
        title: 'Lecture with subtitle override',
        audiences: [audienceBeginner.id],
        subtitles: [{ locale: 'es', url: 'https://example.com/override-es.vtt' }],
      },
    )

    // No-audience excerpt — should never appear.
    await testData.createLectureExcerpt(
      payload,
      { fullLecture: lectureBeginnerOnly.id },
      { title: 'No-audience excerpt', audiences: [] },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Validation', () => {
    it('returns 400 when limit is missing', async () => {
      const { status } = await callEndpoint(payload, {})
      expect(status).toBe(400)
    })

    it('returns 400 when limit is out of range', async () => {
      expect((await callEndpoint(payload, { limit: 0 })).status).toBe(400)
      expect((await callEndpoint(payload, { limit: 101 })).status).toBe(400)
    })

    it('returns 400 when a numeric param is non-numeric', async () => {
      const { status } = await callEndpoint(payload, {
        limit: 10,
        pathProgress: 'not-a-number',
      })
      expect(status).toBe(400)
    })

    it('returns 400 when any audience-data param is missing', async () => {
      const { status } = await callEndpoint(
        payload,
        { limit: 10, pathProgress: 3 },
        undefined,
        { skipAudienceDefaults: true },
      )
      expect(status).toBe(400)
    })
  })

  describe('Uniform response shape', () => {
    it('emits the same flat key set for every record (no excerpt-vs-full branching)', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const docs = (body as { docs: LecturePlayerData[] }).docs

      expect(docs.length).toBeGreaterThan(0)
      const expectedKeys = [
        'duration',
        'fullLectureId',
        'hlsUrl',
        'id',
        'startTime',
        'stopTime',
        'subtitles',
        'thumbnailUrl',
        'title',
        'videoUrl',
      ]
      for (const doc of docs) {
        expect(Object.keys(doc).sort()).toEqual(expectedKeys)
        // No legacy discriminator
        expect((doc as unknown as { type?: unknown }).type).toBeUndefined()
        // No legacy lectureId field — replaced by fullLectureId
        expect((doc as unknown as { lectureId?: unknown }).lectureId).toBeUndefined()
      }
    })

    it('respects `limit` across the full pool', async () => {
      const { body } = await callEndpoint(payload, { limit: 1, pathProgress: 3 })
      const docs = (body as { docs: LecturePlayerData[] }).docs
      expect(docs).toHaveLength(1)
    })

    it('fetches the full eligible pool, not just `limit` rows, before sampling', async () => {
      const findSpy = vi.spyOn(payload, 'find')
      try {
        await callEndpoint(payload, { limit: 1, pathProgress: 3 })
        const lectureFindCall = findSpy.mock.calls.find(
          ([args]) => (args as { collection?: string }).collection === 'lectures',
        )
        expect(lectureFindCall).toBeDefined()
        const args = lectureFindCall![0] as { limit?: number; pagination?: boolean }
        // limit:0 = no limit. Combined with pagination:false, this ensures the
        // Fisher-Yates shuffle samples uniformly across the entire eligible
        // pool rather than just the first N rows by DB order.
        expect(args.limit).toBe(0)
        expect(args.pagination).toBe(false)
      } finally {
        findSpy.mockRestore()
      }
    })
  })

  describe('Default time fields', () => {
    it('lectures with no startTime/stopTime resolve to startTime=0, stopTime=null when metadata.duration is missing', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureBeginnerOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.startTime).toBe(0)
      expect(lecture!.stopTime).toBeNull()
      expect(lecture!.duration).toBeNull()
      expect(lecture!.fullLectureId).toBeNull()
    })

    it('lectures with metadata.duration but no explicit stopTime fall through to metadata.duration', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Lecture With Duration',
        thumbnailUrl: 'https://example.com/metadata-thumb.jpg',
        hlsUrl: 'https://example.com/stream-d.m3u8',
        subtitles: [],
        duration: 1200,
      })
      const lectureWithDuration = await testData.createLecture(
        payload,
        {},
        { title: 'Lecture With Duration', audiences: [audienceBeginner.id] },
      )

      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureWithDuration.id,
      )
      expect(item).toBeDefined()
      expect(item!.startTime).toBe(0)
      expect(item!.stopTime).toBe(1200)
      expect(item!.duration).toBe(1200)
    })

    it('excerpts with explicit startTime/stopTime pass them through and expose fullLectureId', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === excerptOfBeginner.id,
      )
      expect(item).toBeDefined()
      expect(item!.startTime).toBe(30)
      expect(item!.stopTime).toBe(150)
      expect(item!.duration).toBe(120)
      expect(item!.fullLectureId).toBe(lectureBeginnerOnly.id)
    })
  })

  describe('Eligibility', () => {
    it('returns lectures whose audiences pass', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).toContain(lectureBeginnerOnly.id)
    })

    it('excludes records with no audiences', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).not.toContain(lectureNoAudience.id)
      const titles = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.title)
      expect(titles).not.toContain('No-audience excerpt')
    })

    it('returns excerpts independently of their fullLecture parent eligibility', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).toContain(excerptOfBeginner.id)
      expect(ids).toContain(excerptOfIntermediate.id)
      const ineligibleParentExcerpt = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === excerptOfIntermediate.id,
      )!
      expect(ineligibleParentExcerpt.fullLectureId).toBe(lectureIntermediateOnly.id)
    })

    it('returns empty docs when no audiences pass', async () => {
      const { status, body } = await callEndpoint(payload, {
        limit: 100,
        pathProgress: 99,
        totalLecturesViewed: 0,
      })
      expect(status).toBe(200)
      expect((body as { docs: LecturePlayerData[] }).docs).toEqual([])
    })
  })

  describe('OR-match audiences', () => {
    it('includes a lecture when ANY of its multiple audiences passes', async () => {
      // pathProgress=3 → Beginner passes, Intermediate fails. Lecture has both.
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).toContain(lectureMultiAudience.id)
    })

    it('excludes a lecture when ALL of its audiences fail', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).not.toContain(lectureAllFailingAudiences.id)
    })
  })

  describe('Subtitle merge', () => {
    it('exposes the full metadata.subtitles map when no overrides are set', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureBeginnerOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.subtitles).toEqual({
        en: 'https://example.com/parent-en.vtt',
        es: 'https://example.com/parent-es.vtt',
      })
    })

    it('layers a per-locale override on top of metadata.subtitles', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureWithSubtitleOverride.id,
      )
      expect(lecture).toBeDefined()
      // `es` overridden; `en` falls through from metadata.
      expect(lecture!.subtitles).toEqual({
        en: 'https://example.com/parent-en.vtt',
        es: 'https://example.com/override-es.vtt',
      })
    })
  })

  describe('Thumbnail fallback', () => {
    it('uses the editor override when present', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureBeginnerOnly.id,
      )
      expect(lecture!.thumbnailUrl).toBeTruthy()
      expect(lecture!.thumbnailUrl).not.toBe('https://example.com/metadata-thumb.jpg')
    })

    it('falls back to metadata.thumbnailUrl when no editor override is set', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 7 })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureIntermediateOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.thumbnailUrl).toBe('https://example.com/metadata-thumb.jpg')
    })
  })

  describe('Clip sources metadata from parent (#338)', () => {
    it('uses parent.metadata.hlsUrl for clip records (clips have metadata: null)', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === excerptOfBeginner.id,
      )
      expect(clip).toBeDefined()
      // Parent (lectureBeginnerOnly) was created with the default NV mock
      // pointing at https://example.com/stream.m3u8.
      expect(clip!.hlsUrl).toBe('https://example.com/stream.m3u8')
    })

    it("falls back to parent.metadata.thumbnailUrl when clip has no own thumbnail", async () => {
      // Set up: a full parent (no editor thumbnail) + a clip with no thumbnail.
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Parent for thumb fallback',
        thumbnailUrl: 'https://example.com/parent-thumb.jpg',
        hlsUrl: 'https://example.com/parent-stream.m3u8',
        subtitles: [],
        duration: null,
      })
      const parent = await testData.createLecture(payload, {}, { audiences: [] })
      const clip = await testData.createLectureExcerpt(
        payload,
        { fullLecture: parent.id },
        { audiences: [audienceBeginner.id] },
      )

      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: LecturePlayerData[] }).docs.find((d) => d.id === clip.id)
      expect(item).toBeDefined()
      expect(item!.thumbnailUrl).toBe('https://example.com/parent-thumb.jpg')
    })

    it('clip thumbnail override wins over parent.metadata.thumbnailUrl', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Parent for clip override',
        thumbnailUrl: 'https://example.com/parent-thumb-2.jpg',
        hlsUrl: 'https://example.com/parent-stream-2.m3u8',
        subtitles: [],
        duration: null,
      })
      const parent = await testData.createLecture(payload, {}, { audiences: [] })
      const overrideThumb = await testData.createMediaImage(payload, { alt: 'Clip override' })
      const clip = await testData.createLectureExcerpt(
        payload,
        { fullLecture: parent.id },
        { audiences: [audienceBeginner.id], thumbnail: overrideThumb.id },
      )

      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: LecturePlayerData[] }).docs.find((d) => d.id === clip.id)
      expect(item).toBeDefined()
      // Override thumbnail came back through the editor relationship, not the
      // parent metadata fallback.
      expect(item!.thumbnailUrl).not.toBe('https://example.com/parent-thumb-2.jpg')
      expect(item!.thumbnailUrl).toBeTruthy()
    })

    it("clip subtitle overrides merge with parent.metadata.subtitles", async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Parent for subtitle merge',
        thumbnailUrl: null,
        hlsUrl: 'https://example.com/parent-merge.m3u8',
        subtitles: [
          { languageCode: 'en', url: 'https://example.com/parent-merge-en.vtt' },
          { languageCode: 'es', url: 'https://example.com/parent-merge-es.vtt' },
        ],
        duration: null,
      })
      const parent = await testData.createLecture(payload, {}, { audiences: [] })
      const clip = await testData.createLectureExcerpt(
        payload,
        { fullLecture: parent.id },
        {
          audiences: [audienceBeginner.id],
          subtitles: [{ locale: 'es', url: 'https://example.com/clip-merge-es.vtt' }],
        },
      )

      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: LecturePlayerData[] }).docs.find((d) => d.id === clip.id)
      expect(item).toBeDefined()
      expect(item!.subtitles).toEqual({
        en: 'https://example.com/parent-merge-en.vtt',
        es: 'https://example.com/clip-merge-es.vtt',
      })
    })

    it('clip falls through to parent.metadata.duration for stopTime when stopTime is unset', async () => {
      const { fetchNirmalaVidyaVideo } = await import('@/lib/nirmalaVidyaApi')
      vi.mocked(fetchNirmalaVidyaVideo).mockResolvedValueOnce({
        title: 'Parent with duration',
        thumbnailUrl: null,
        hlsUrl: 'https://example.com/parent-dur.m3u8',
        subtitles: [],
        duration: 900,
      })
      const parent = await testData.createLecture(payload, {}, { audiences: [] })
      const clip = await testData.createLectureExcerpt(
        payload,
        { fullLecture: parent.id },
        { audiences: [audienceBeginner.id], startTime: null, stopTime: null },
      )

      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: LecturePlayerData[] }).docs.find((d) => d.id === clip.id)
      expect(item).toBeDefined()
      expect(item!.startTime).toBe(0)
      expect(item!.stopTime).toBe(900)
      expect(item!.duration).toBe(900)
    })
  })

  describe('req forwarding', () => {
    it('threads req through all payload.find calls for usage-tracking / rate-limit hooks', async () => {
      void audienceIntermediate
      void lectureIntermediateOnly

      const client = (await testData.createClient(payload, adminUserId, {
        name: 'Lectures Forwarding Test',
      })) as Client

      const findSpy = vi.spyOn(payload, 'find')
      try {
        const { status } = await callEndpoint(
          payload,
          { limit: 5, pathProgress: 3 },
          { id: client.id, collection: 'clients' },
        )
        expect(status).toBe(200)

        const collectionsHit = new Set(
          findSpy.mock.calls
            .map(([args]) => (args as { collection?: string }).collection)
            .filter(Boolean) as string[],
        )
        expect(collectionsHit.has('audiences')).toBe(true)
        expect(collectionsHit.has('lectures')).toBe(true)

        for (const args of findSpy.mock.calls.map((c) => c[0])) {
          const r = (args as { req?: { user?: { id: unknown; collection: string } } }).req
          expect(r?.user?.id).toBe(client.id)
          expect(r?.user?.collection).toBe('clients')
        }
      } finally {
        findSpy.mockRestore()
      }
    })
  })
})
