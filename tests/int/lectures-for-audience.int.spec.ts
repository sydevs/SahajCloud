import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Audience, Client, Image, Lecture, LectureClip } from '@/payload-types'

import { lecturesForAudience } from '@/endpoints/lecturesForAudience'
import type { LectureClipPlayerData, LecturePlayerData } from '@/lib/lectureClipShape'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type ItemPlayerData = LecturePlayerData | LectureClipPlayerData

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
): Promise<{ status: number; body: { docs: ItemPlayerData[] } | unknown }> {
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

  let clipWithEligibleParent: LectureClip
  let clipWithIneligibleParent: LectureClip
  let clipMissingOverrides: LectureClip
  let clipMultiAudience: LectureClip
  let clipAllFailingAudiences: LectureClip

  let parentThumbnailImage: Image
  let clipThumbnailImage: Image

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

    parentThumbnailImage = (await testData.createMediaImage(payload, {
      alt: 'Parent editor override',
    })) as Image
    clipThumbnailImage = (await testData.createMediaImage(payload, {
      alt: 'Clip editor override',
    })) as Image

    // lectureBeginnerOnly has a parent-level editor thumbnail override so we
    // can exercise the 2nd-tier fallback (parent editor → metadata).
    lectureBeginnerOnly = await testData.createLecture(
      payload,
      { thumbnail: parentThumbnailImage.id },
      { title: 'Beginner Lecture', audiences: [audienceBeginner.id] },
    )
    // lectureIntermediateOnly has no editor override; fallback lands on
    // metadata.thumbnailUrl.
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

    // OR-match coverage: lecture has one passing audience + one failing
    // audience. Should be returned for pathProgress=3 (Beginner passes).
    lectureMultiAudience = await testData.createLecture(
      payload,
      {},
      {
        title: 'Multi Audience Lecture',
        audiences: [audienceBeginner.id, audienceIntermediate.id],
      },
    )

    // OR-match coverage: lecture has only failing audiences for the test
    // viewer. Should be excluded for pathProgress=3 (Intermediate fails).
    lectureAllFailingAudiences = await testData.createLecture(
      payload,
      {},
      {
        title: 'All Failing Audiences Lecture',
        audiences: [audienceIntermediate.id],
      },
    )

    // Clip with its own thumbnail override + one subtitle override — exercises
    // the tier-1 thumbnail fallback and the subtitle merge layer.
    clipWithEligibleParent = await testData.createLectureClip(
      payload,
      { lecture: lectureBeginnerOnly.id },
      {
        title: 'Clip of Beginner Lecture',
        audiences: [audienceBeginner.id],
        thumbnail: clipThumbnailImage.id,
        subtitles: [{ locale: 'es', url: 'https://example.com/clip-es.vtt' }],
      },
    )

    // Clip whose parent is itself NOT audience-eligible. Clip has its own
    // thumbnail override; parent has no editor override → tier-1 win.
    clipWithIneligibleParent = await testData.createLectureClip(
      payload,
      { lecture: lectureIntermediateOnly.id },
      {
        title: 'Clip of Intermediate Lecture',
        audiences: [audienceBeginner.id],
        thumbnail: clipThumbnailImage.id,
      },
    )

    // Clip missing its own overrides → falls back to parent editor thumbnail
    // (lectureBeginnerOnly has one) and parent metadata subtitles.
    clipMissingOverrides = await testData.createLectureClip(
      payload,
      { lecture: lectureBeginnerOnly.id },
      {
        title: 'Clip relying on parent fallbacks',
        audiences: [audienceBeginner.id],
      },
    )

    // OR-match coverage: clip with one passing + one failing audience.
    clipMultiAudience = await testData.createLectureClip(
      payload,
      { lecture: lectureBeginnerOnly.id },
      {
        title: 'Multi Audience Clip',
        audiences: [audienceBeginner.id, audienceIntermediate.id],
      },
    )

    // OR-match coverage: clip with only failing audience.
    clipAllFailingAudiences = await testData.createLectureClip(
      payload,
      { lecture: lectureBeginnerOnly.id },
      {
        title: 'All Failing Audiences Clip',
        audiences: [audienceIntermediate.id],
      },
    )

    // Clip with no audience — should never appear.
    await testData.createLectureClip(
      payload,
      { lecture: lectureBeginnerOnly.id },
      { title: 'No audience clip', audiences: [] },
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
      // Only `limit` + a single audience param supplied; the other three
      // required audience params are absent → Zod fails the request.
      const { status } = await callEndpoint(
        payload,
        { limit: 10, pathProgress: 3 },
        undefined,
        { skipAudienceDefaults: true },
      )
      expect(status).toBe(400)
    })
  })

  // Discriminator helpers — clips carry a `lectureId`; lectures omit it.
  const isClip = (d: ItemPlayerData) => typeof d.lectureId === 'number'
  const isLecture = (d: ItemPlayerData) => d.lectureId === undefined

  describe('Flat response shape', () => {
    it('emits only the flat ItemPlayerData keys — no nested parent document', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const docs = (body as { docs: ItemPlayerData[] }).docs

      expect(docs.length).toBeGreaterThan(0)
      const lectureKeys = [
        'id',
        'type',
        'title',
        'hlsUrl',
        'videoUrl',
        'thumbnailUrl',
        'subtitles',
        'startTime',
        'endTime',
        'duration',
      ].sort()
      const clipKeys = [...lectureKeys, 'lectureId'].sort()
      for (const doc of docs) {
        const expected = isClip(doc) ? clipKeys : lectureKeys
        expect(Object.keys(doc).sort()).toEqual(expected)
        // No removed/legacy fields
        expect((doc as unknown as { parentId?: unknown }).parentId).toBeUndefined()
        // No unexpected nested parent object
        expect((doc as unknown as { parent?: unknown }).parent).toBeUndefined()
      }
    })

    it('includes both lectures and clips in a single feed', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const docs = (body as { docs: ItemPlayerData[] }).docs
      expect(docs.some(isLecture)).toBe(true)
      expect(docs.some(isClip)).toBe(true)
    })

    it('respects a single `limit` across the combined pool', async () => {
      const { body } = await callEndpoint(payload, { limit: 1, pathProgress: 3 })
      const docs = (body as { docs: ItemPlayerData[] }).docs
      expect(docs).toHaveLength(1)
    })
  })

  describe('Lecture shape', () => {
    it('pulls videoUrl from metadata.hlsUrl and exposes startTime=0, no lectureId', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isLecture(d) && d.id === lectureBeginnerOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.videoUrl).toBe('https://example.com/stream.m3u8')
      // hlsUrl is the canonical name; videoUrl is a deprecated alias (#319)
      expect(lecture!.hlsUrl).toBe(lecture!.videoUrl)
      expect(lecture!.startTime).toBe(0)
      expect(lecture!.lectureId).toBeUndefined()
    })

    it('returns endTime/duration = null when metadata.duration is missing (transient pre-sync state)', async () => {
      // Default mock NV response has no `duration`, so seeded lectures lack it.
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isLecture(d) && d.id === lectureBeginnerOnly.id,
      )
      expect(lecture!.endTime).toBeNull()
      expect(lecture!.duration).toBeNull()
    })

    it('exposes numeric endTime/duration when metadata.duration is populated', async () => {
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
      const item = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isLecture(d) && d.id === lectureWithDuration.id,
      )
      expect(item).toBeDefined()
      expect(item!.endTime).toBe(1200)
      expect(item!.duration).toBe(1200)
    })
  })

  describe('Clip shape', () => {
    it('exposes clip `duration` from the virtual field (endTime − startTime)', async () => {
      const clip = await testData.createLectureClip(
        payload,
        { lecture: lectureBeginnerOnly.id },
        {
          title: 'Clip with known duration',
          audiences: [audienceBeginner.id],
          startTime: 30,
          endTime: 150,
        },
      )
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const item = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clip.id,
      )
      expect(item).toBeDefined()
      expect(item!.startTime).toBe(30)
      expect(item!.endTime).toBe(150)
      expect(item!.duration).toBe(120)
    })
  })

  describe('Eligibility', () => {
    it('returns lectures whose audiences pass', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: ItemPlayerData[] }).docs.filter(isLecture).map((d) => d.id)
      expect(ids).toContain(lectureBeginnerOnly.id)
    })

    it('excludes lectures and clips with no audiences', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const docs = (body as { docs: ItemPlayerData[] }).docs
      const lectureIds = docs.filter(isLecture).map((d) => d.id)
      expect(lectureIds).not.toContain(lectureNoAudience.id)
      const clipTitles = docs.filter(isClip).map((d) => d.title)
      expect(clipTitles).not.toContain('No audience clip')
    })

    it('returns clips independently of parent eligibility', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clipIds = (body as { docs: ItemPlayerData[] }).docs.filter(isClip).map((d) => d.id)
      expect(clipIds).toContain(clipWithEligibleParent.id)
      expect(clipIds).toContain(clipWithIneligibleParent.id)
    })

    it('emits lectureId for every clip regardless of parent eligibility', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ineligibleClip = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clipWithIneligibleParent.id,
      )
      expect(ineligibleClip).toBeDefined()
      expect(ineligibleClip!.lectureId).toBe(lectureIntermediateOnly.id)
    })

    it('returns empty docs when no audiences pass', async () => {
      const { status, body } = await callEndpoint(payload, {
        limit: 100,
        pathProgress: 99,
        totalLecturesViewed: 0,
      })
      expect(status).toBe(200)
      expect((body as { docs: ItemPlayerData[] }).docs).toEqual([])
    })
  })

  describe('OR-match audiences', () => {
    it('includes a lecture when ANY of its multiple audiences passes', async () => {
      // pathProgress=3 → Beginner passes, Intermediate fails. Lecture has both.
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: ItemPlayerData[] }).docs.filter(isLecture).map((d) => d.id)
      expect(ids).toContain(lectureMultiAudience.id)
    })

    it('excludes a lecture when ALL of its audiences fail', async () => {
      // pathProgress=3 → Intermediate fails. Lecture has only Intermediate.
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: ItemPlayerData[] }).docs.filter(isLecture).map((d) => d.id)
      expect(ids).not.toContain(lectureAllFailingAudiences.id)
    })

    it('includes a clip when ANY of its multiple audiences passes', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: ItemPlayerData[] }).docs.filter(isClip).map((d) => d.id)
      expect(ids).toContain(clipMultiAudience.id)
    })

    it('excludes a clip when ALL of its audiences fail', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: ItemPlayerData[] }).docs.filter(isClip).map((d) => d.id)
      expect(ids).not.toContain(clipAllFailingAudiences.id)
    })
  })

  describe('Subtitle merge', () => {
    it('exposes the full parent subtitle map when the clip has no overrides', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clipMissingOverrides.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.subtitles).toEqual({
        en: 'https://example.com/parent-en.vtt',
        es: 'https://example.com/parent-es.vtt',
      })
    })

    it('layers a per-locale clip override on top of the parent map', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clipWithEligibleParent.id,
      )
      expect(clip).toBeDefined()
      // `es` overridden by clip; `en` unchanged from parent metadata.
      expect(clip!.subtitles).toEqual({
        en: 'https://example.com/parent-en.vtt',
        es: 'https://example.com/clip-es.vtt',
      })
    })

    it('returns the parent metadata subtitles for a lecture item', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isLecture(d) && d.id === lectureBeginnerOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.subtitles).toEqual({
        en: 'https://example.com/parent-en.vtt',
        es: 'https://example.com/parent-es.vtt',
      })
    })
  })

  describe('Thumbnail fallback chain', () => {
    it('clip tier-1: uses the clip editor override when present', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clipWithEligibleParent.id,
      )
      expect(clip!.thumbnailUrl).toBeTruthy()
      expect(clip!.thumbnailUrl).not.toBe('https://example.com/metadata-thumb.jpg')
      // Both editor-override images are the default test image so we can't
      // distinguish clip override vs parent override by URL here — but we can
      // check it's neither null nor the metadata URL.
    })

    it('clip tier-2: falls back to parent editor thumbnail when clip has none', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clipMissingOverrides.id,
      )
      // lectureBeginnerOnly has a parent editor override; clip has none.
      expect(clip!.thumbnailUrl).toBeTruthy()
      // Must not be the metadata URL — because the parent editor override wins.
      expect(clip!.thumbnailUrl).not.toBe('https://example.com/metadata-thumb.jpg')
    })

    it('clip tier-3: falls back to parent metadata.thumbnailUrl when neither editor override exists', async () => {
      // Create a fresh parent with NO editor thumbnail, and a clip with no override.
      const parentNoOverride = await testData.createLecture(
        payload,
        {},
        { title: 'Parent without editor thumb', audiences: [audienceBeginner.id] },
      )
      const clipNoOverride = await testData.createLectureClip(
        payload,
        { lecture: parentNoOverride.id },
        { title: 'Clip relying on metadata url', audiences: [audienceBeginner.id] },
      )

      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isClip(d) && d.id === clipNoOverride.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.thumbnailUrl).toBe('https://example.com/metadata-thumb.jpg')
    })

    it('lecture tier-1: uses editor override when present', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lecture = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isLecture(d) && d.id === lectureBeginnerOnly.id,
      )
      expect(lecture!.thumbnailUrl).toBeTruthy()
      expect(lecture!.thumbnailUrl).not.toBe('https://example.com/metadata-thumb.jpg')
    })

    it('lecture tier-2: falls back to metadata.thumbnailUrl', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 7 })
      const lecture = (body as { docs: ItemPlayerData[] }).docs.find(
        (d) => isLecture(d) && d.id === lectureIntermediateOnly.id,
      )
      expect(lecture).toBeDefined()
      expect(lecture!.thumbnailUrl).toBe('https://example.com/metadata-thumb.jpg')
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
        expect(collectionsHit.has('lecture-clips')).toBe(true)

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

  // Silence unused-var linter for image references kept around for context.
  void parentThumbnailImage
  void clipThumbnailImage
})
