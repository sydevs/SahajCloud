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

// `audiences` is required by the endpoint's Zod schema. Tests that don't
// exercise a specific eligibility scenario still need to pass a non-empty
// list; pass `{ skipDefaultAudiences: true }` on the 400-validation cases
// that want to omit it entirely.
async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  user?: { id: number | string; collection: string },
  options: { skipDefaultAudiences?: boolean; defaultAudiences?: string } = {},
): Promise<{ status: number; headers: Headers; body: { docs: LecturePlayerData[] } | unknown }> {
  const finalQuery = options.skipDefaultAudiences
    ? query
    : { audiences: options.defaultAudiences ?? '', ...query }
  const req = {
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: {},
    user,
  } as unknown as PayloadRequest

  const response = (await lecturesForAudience.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, headers: response.headers, body }
}

describe('lecturesForAudience endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let audienceBeginner: Audience
  let audienceIntermediate: Audience
  let audienceUnused: Audience

  let beginnerOnly: string // audiences param for "Beginner only is eligible"
  let intermediateOnly: string

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
    // No lectures attached — used to exercise the empty-result path.
    audienceUnused = await testData.createAudience(payload, {
      label: 'Unused',
      rules: { logic: 'AND', pathProgress: { min: 50, max: 100 } },
    })

    beginnerOnly = String(audienceBeginner.id)
    intermediateOnly = String(audienceIntermediate.id)

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

    // OR-match: passes when ANY attached audience is in the requested list.
    lectureMultiAudience = await testData.createLecture(
      payload,
      {},
      {
        title: 'Multi Audience Lecture',
        audiences: [audienceBeginner.id, audienceIntermediate.id],
      },
    )

    // Should be excluded when only Beginner is requested.
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
      const { status } = await callEndpoint(payload, {}, undefined, {
        defaultAudiences: beginnerOnly,
      })
      expect(status).toBe(400)
    })

    it('returns 400 when limit is out of range', async () => {
      expect(
        (await callEndpoint(payload, { limit: 0 }, undefined, { defaultAudiences: beginnerOnly })).status,
      ).toBe(400)
      expect(
        (await callEndpoint(payload, { limit: 101 }, undefined, { defaultAudiences: beginnerOnly })).status,
      ).toBe(400)
    })

    it('returns 400 when audiences is missing', async () => {
      const { status } = await callEndpoint(
        payload,
        { limit: 10 },
        undefined,
        { skipDefaultAudiences: true },
      )
      expect(status).toBe(400)
    })

    it('returns 400 when audiences is empty', async () => {
      const { status } = await callEndpoint(payload, { audiences: '', limit: 10 })
      expect(status).toBe(400)
    })

    it('returns 400 when audiences contains non-numeric values', async () => {
      const { status } = await callEndpoint(payload, { audiences: '1,abc,3', limit: 10 })
      expect(status).toBe(400)
    })
  })

  describe('Cache headers', () => {
    it('sets Cache-Control: public, max-age=600, s-maxage=600', async () => {
      const { headers, status } = await callEndpoint(
        payload,
        { limit: 10 },
        undefined,
        { defaultAudiences: beginnerOnly },
      )
      expect(status).toBe(200)
      expect(headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600')
    })
  })

  describe('audiences param normalization', () => {
    it('treats unsorted/duplicated audiences as equivalent to the canonical sorted form', async () => {
      const canonical = `${audienceBeginner.id},${audienceIntermediate.id}`
      const messy = `${audienceIntermediate.id},${audienceBeginner.id},${audienceBeginner.id}`

      const a = await callEndpoint(payload, { audiences: canonical, limit: 100 })
      const b = await callEndpoint(payload, { audiences: messy, limit: 100 })
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)

      const idsA = (a.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id).sort((x, y) => x - y)
      const idsB = (b.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id).sort((x, y) => x - y)
      // Same eligible pool — random order but identical set.
      expect(idsA).toEqual(idsB)
    })
  })

  describe('Uniform response shape', () => {
    it('emits the same flat key set for every record (no excerpt-vs-full branching)', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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
      const { body } = await callEndpoint(payload, { limit: 1 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const docs = (body as { docs: LecturePlayerData[] }).docs
      expect(docs).toHaveLength(1)
    })

    it('fetches the full eligible pool, not just `limit` rows, before sampling', async () => {
      const findSpy = vi.spyOn(payload, 'find')
      try {
        await callEndpoint(payload, { limit: 1 }, undefined, {
          defaultAudiences: beginnerOnly,
        })
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
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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

      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const item = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureWithDuration.id,
      )
      expect(item).toBeDefined()
      expect(item!.startTime).toBe(0)
      expect(item!.stopTime).toBe(1200)
      expect(item!.duration).toBe(1200)
    })

    it('excerpts with explicit startTime/stopTime pass them through and expose fullLectureId', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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
    it('returns lectures whose audiences overlap the requested list', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).toContain(lectureBeginnerOnly.id)
    })

    it('excludes records with no audiences', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).not.toContain(lectureNoAudience.id)
      const titles = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.title)
      expect(titles).not.toContain('No-audience excerpt')
    })

    it('returns clips independently of their parent audience eligibility', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).toContain(excerptOfBeginner.id)
      expect(ids).toContain(excerptOfIntermediate.id)
    })

    it('returns empty docs when the requested audiences match no lectures', async () => {
      const { status, body } = await callEndpoint(payload, {
        audiences: String(audienceUnused.id),
        limit: 100,
      })
      expect(status).toBe(200)
      expect((body as { docs: LecturePlayerData[] }).docs).toEqual([])
    })
  })

  describe('fullLectureId audience gating (#341)', () => {
    it('exposes fullLectureId when the parent lecture is in the eligible audience set', async () => {
      // excerptOfBeginner → parent is lectureBeginnerOnly (audiences: [Beginner])
      // Request with Beginner eligible → intersection → fullLectureId populated.
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === excerptOfBeginner.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.fullLectureId).toBe(lectureBeginnerOnly.id)
    })

    it('returns fullLectureId: null when the parent lecture is NOT in the eligible audience set', async () => {
      // excerptOfIntermediate → parent is lectureIntermediateOnly (audiences: [Intermediate])
      // Request with only Beginner eligible → no intersection → fullLectureId null.
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === excerptOfIntermediate.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.fullLectureId).toBeNull()
    })

    it('exposes fullLectureId when both parent and clip share an eligible audience', async () => {
      // Request with both Beginner + Intermediate eligible → parent qualifies.
      const bothAudiences = `${audienceBeginner.id},${audienceIntermediate.id}`
      const { body } = await callEndpoint(payload, { audiences: bothAudiences, limit: 100 })
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === excerptOfIntermediate.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.fullLectureId).toBe(lectureIntermediateOnly.id)
    })
  })

  describe('OR-match audiences', () => {
    it('includes a lecture when ANY of its multiple audiences overlaps the requested list', async () => {
      // Requested only Beginner. lectureMultiAudience has [Beginner, Intermediate].
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).toContain(lectureMultiAudience.id)
    })

    it('excludes a lecture when NONE of its audiences are in the requested list', async () => {
      // Requested only Beginner. lectureAllFailingAudiences has [Intermediate].
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
      expect(ids).not.toContain(lectureAllFailingAudiences.id)
    })
  })

  describe('Subtitle merge', () => {
    it('exposes the full metadata.subtitles map when no overrides are set', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureBeginnerOnly.id,
      )
      expect(lecture!.thumbnailUrl).toBeTruthy()
      expect(lecture!.thumbnailUrl).not.toBe('https://example.com/metadata-thumb.jpg')
    })

    it('falls back to metadata.thumbnailUrl when no editor override is set', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: intermediateOnly,
      })
      const lecture = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === lectureIntermediateOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.thumbnailUrl).toBe('https://example.com/metadata-thumb.jpg')
    })
  })

  describe('Clip sources metadata from parent (#338)', () => {
    it('uses parent.metadata.hlsUrl for clip records (clips have metadata: null)', async () => {
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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

      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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

      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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

      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
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

      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, {
        defaultAudiences: beginnerOnly,
      })
      const item = (body as { docs: LecturePlayerData[] }).docs.find((d) => d.id === clip.id)
      expect(item).toBeDefined()
      expect(item!.startTime).toBe(0)
      expect(item!.stopTime).toBe(900)
      expect(item!.duration).toBe(900)
    })
  })

  describe('priority ordering', () => {
    // Audience A: 1 pinned (priority 5) + 3 normal (priority 0) + 1 unset (tests 1 & 4)
    let audienceA: Audience
    let lectureAPinned: Lecture
    let lectureANormal1: Lecture
    let lectureANormal2: Lecture
    let lectureANormal3: Lecture
    let lectureAUnset: Lecture

    // Audience B: all pinned at distinct priorities 10 / 5 / 1 (tests 2 & 5)
    let audienceB: Audience
    let lectureBHigh: Lecture
    let lectureBMid: Lecture
    let lectureBLow: Lecture

    // Audience C: two lectures at equal priority 5 (test 3)
    let audienceC: Audience
    let lectureCTie1: Lecture
    let lectureCTie2: Lecture

    // Audience D: 4 pinned lectures at distinct priorities (test 6)
    let audienceD: Audience
    let lectureDPinned1: Lecture
    let lectureDPinned2: Lecture
    let lectureDPinned3: Lecture
    let lectureDPinned4: Lecture

    // Audience E: 3 lectures all at priority 0 — all-normal pool (test 7)
    let audienceE: Audience
    let lectureENormal1: Lecture
    let lectureENormal2: Lecture
    let lectureENormal3: Lecture

    beforeAll(async () => {
      audienceA = await testData.createAudience(payload)
      audienceB = await testData.createAudience(payload)
      audienceC = await testData.createAudience(payload)
      audienceD = await testData.createAudience(payload)
      audienceE = await testData.createAudience(payload)

      lectureAPinned = await testData.createLecture(payload, {}, { audiences: [audienceA.id], priority: 5 })
      lectureANormal1 = await testData.createLecture(payload, {}, { audiences: [audienceA.id], priority: 0 })
      lectureANormal2 = await testData.createLecture(payload, {}, { audiences: [audienceA.id], priority: 0 })
      lectureANormal3 = await testData.createLecture(payload, {}, { audiences: [audienceA.id], priority: 0 })
      // Priority field omitted — defaultValue:0 applies, testing the "unset" path
      lectureAUnset = await testData.createLecture(payload, {}, { audiences: [audienceA.id] })

      lectureBHigh = await testData.createLecture(payload, {}, { audiences: [audienceB.id], priority: 10 })
      lectureBMid = await testData.createLecture(payload, {}, { audiences: [audienceB.id], priority: 5 })
      lectureBLow = await testData.createLecture(payload, {}, { audiences: [audienceB.id], priority: 1 })

      lectureCTie1 = await testData.createLecture(payload, {}, { audiences: [audienceC.id], priority: 5 })
      lectureCTie2 = await testData.createLecture(payload, {}, { audiences: [audienceC.id], priority: 5 })

      lectureDPinned1 = await testData.createLecture(payload, {}, { audiences: [audienceD.id], priority: 10 })
      lectureDPinned2 = await testData.createLecture(payload, {}, { audiences: [audienceD.id], priority: 8 })
      lectureDPinned3 = await testData.createLecture(payload, {}, { audiences: [audienceD.id], priority: 6 })
      lectureDPinned4 = await testData.createLecture(payload, {}, { audiences: [audienceD.id], priority: 4 })

      lectureENormal1 = await testData.createLecture(payload, {}, { audiences: [audienceE.id], priority: 0 })
      lectureENormal2 = await testData.createLecture(payload, {}, { audiences: [audienceE.id], priority: 0 })
      lectureENormal3 = await testData.createLecture(payload, {}, { audiences: [audienceE.id], priority: 0 })
    })

    it('pinned lecture (priority > 0) always appears before all un-pinned lectures', async () => {
      const param = String(audienceA.id)
      for (let i = 0; i < 5; i++) {
        const { body } = await callEndpoint(payload, { limit: 100 }, undefined, { defaultAudiences: param })
        const docs = (body as { docs: LecturePlayerData[] }).docs
        const pinnedIdx = docs.findIndex((d) => d.id === lectureAPinned.id)
        expect(pinnedIdx).toBe(0)
        for (const normal of [lectureANormal1, lectureANormal2, lectureANormal3, lectureAUnset]) {
          expect(pinnedIdx).toBeLessThan(docs.findIndex((d) => d.id === normal.id))
        }
      }
    })

    it('lecture with higher priority always appears before lower-priority lecture', async () => {
      const param = String(audienceB.id)
      for (let i = 0; i < 5; i++) {
        const { body } = await callEndpoint(payload, { limit: 100 }, undefined, { defaultAudiences: param })
        const docs = (body as { docs: LecturePlayerData[] }).docs
        const highIdx = docs.findIndex((d) => d.id === lectureBHigh.id)
        const midIdx = docs.findIndex((d) => d.id === lectureBMid.id)
        const lowIdx = docs.findIndex((d) => d.id === lectureBLow.id)
        expect(highIdx).toBeLessThan(midIdx)
        expect(midIdx).toBeLessThan(lowIdx)
      }
    })

    it('equal-priority lectures appear in random order across calls', async () => {
      const param = String(audienceC.id)
      const orderings = new Set<string>()

      for (let i = 0; i < 20; i++) {
        const { body } = await callEndpoint(payload, { limit: 100 }, undefined, { defaultAudiences: param })
        const docs = (body as { docs: LecturePlayerData[] }).docs
        const tie1Idx = docs.findIndex((d) => d.id === lectureCTie1.id)
        const tie2Idx = docs.findIndex((d) => d.id === lectureCTie2.id)
        orderings.add(tie1Idx < tie2Idx ? 'tie1-first' : 'tie2-first')
      }

      expect(orderings.size).toBe(2)
    })

    it('lecture with default priority (unset → 0) participates in the normal pool, after pinned', async () => {
      const param = String(audienceA.id)
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, { defaultAudiences: param })
      const docs = (body as { docs: LecturePlayerData[] }).docs
      const pinnedIdx = docs.findIndex((d) => d.id === lectureAPinned.id)
      const unsetIdx = docs.findIndex((d) => d.id === lectureAUnset.id)
      expect(pinnedIdx).toBeLessThan(unsetIdx)
    })

    it('all-pinned pool is sorted by priority descending with no normal items appended', async () => {
      const param = String(audienceB.id)
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, { defaultAudiences: param })
      const docs = (body as { docs: LecturePlayerData[] }).docs
      expect(docs).toHaveLength(3)
      expect(docs[0].id).toBe(lectureBHigh.id)
      expect(docs[1].id).toBe(lectureBMid.id)
      expect(docs[2].id).toBe(lectureBLow.id)
    })

    it('when limit is smaller than the pinned pool, only the highest-priority lectures are returned', async () => {
      const param = String(audienceD.id)
      const { body } = await callEndpoint(payload, { limit: 2 }, undefined, { defaultAudiences: param })
      const docs = (body as { docs: LecturePlayerData[] }).docs
      expect(docs).toHaveLength(2)
      const returnedIds = docs.map((d) => d.id)
      expect(returnedIds).toContain(lectureDPinned1.id)
      expect(returnedIds).toContain(lectureDPinned2.id)
      expect(returnedIds).not.toContain(lectureDPinned3.id)
      expect(returnedIds).not.toContain(lectureDPinned4.id)
    })

    it('all-normal pool (no pinned lectures) returns all lectures', async () => {
      const param = String(audienceE.id)
      const { body } = await callEndpoint(payload, { limit: 100 }, undefined, { defaultAudiences: param })
      const docs = (body as { docs: LecturePlayerData[] }).docs
      const returnedIds = docs.map((d) => d.id)
      expect(returnedIds).toContain(lectureENormal1.id)
      expect(returnedIds).toContain(lectureENormal2.id)
      expect(returnedIds).toContain(lectureENormal3.id)
    })
  })

  describe('req forwarding', () => {
    it('threads req through the lectures payload.find call for usage-tracking / rate-limit hooks', async () => {
      void audienceIntermediate
      void lectureIntermediateOnly

      const client = (await testData.createClient(payload, adminUserId, {
        name: 'Lectures Forwarding Test',
      })) as Client

      const findSpy = vi.spyOn(payload, 'find')
      try {
        const { status } = await callEndpoint(
          payload,
          { limit: 5 },
          { id: client.id, collection: 'clients' },
          { defaultAudiences: beginnerOnly },
        )
        expect(status).toBe(200)

        const collectionsHit = new Set(
          findSpy.mock.calls
            .map(([args]) => (args as { collection?: string }).collection)
            .filter(Boolean) as string[],
        )
        expect(collectionsHit.has('lectures')).toBe(true)

        for (const args of findSpy.mock.calls.map((c) => c[0])) {
          const r = (
            args as {
              req?: {
                user?: { id: unknown; collection: string }
                context?: Record<string, unknown>
              }
            }
          ).req
          expect(r?.user?.id).toBe(client.id)
          expect(r?.user?.collection).toBe('clients')
          expect(r?.context?.['skipClientQueryValidation']).toBe(true)
        }
      } finally {
        findSpy.mockRestore()
      }
    })
  })
})
