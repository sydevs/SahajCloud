import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { meditationLectures } from '@/collections/Meditations/endpoints/lectures'
import type { LecturePlayerData } from '@/lib/lectureShape'
import { recomputeWeightsForMeditation } from '@/lib/meditations/nodeWeights'
import type {
  Audience,
  Client,
  Frame,
  Lecture,
  Meditation,
  SubtleSystemNode,
  UserChoice,
} from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from NV',
      thumbnailUrl: 'https://example.com/metadata-thumb.jpg',
      hlsUrl: 'https://example.com/stream.m3u8',
      subtitles: [{ languageCode: 'en', url: 'https://example.com/parent-en.vtt' }],
      duration: null,
    }),
  }
})

const DEFAULT_CLIENT_USER = { id: 0, collection: 'clients', active: true }

// `audiences` is a required, non-empty comma-separated list of IDs. Tests
// that don't exercise validation pass the resolved-audience ID through
// `defaultAudiences`. Cases that want to omit it entirely set
// `skipDefaultAudiences: true`.
async function callEndpoint(
  payload: Payload,
  meditationId: number | string,
  query: Record<string, string | number | boolean> = {},
  options: {
    skipDefaultAudiences?: boolean
    defaultAudiences?: string
    user?: { id: number | string; collection: string; active?: boolean } | null
  } = {},
): Promise<{ status: number; headers: Headers; body: { docs: LecturePlayerData[] } | unknown }> {
  const finalQuery = options.skipDefaultAudiences
    ? query
    : { audiences: options.defaultAudiences ?? '', ...query }
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(finalQuery)) {
    searchParams.set(key, String(value))
  }
  const url = `http://localhost:3000/api/meditations/${meditationId}/related-lectures?${searchParams.toString()}`
  const req = {
    url,
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: { id: meditationId },
    // Mirror production HTTP-request defaulting: no explicit `?locale=` ⇒ 'en'.
    // Without this, localized fields (lecture.title) come back as
    // `{ en: '...' }` objects.
    locale: 'en',
    fallbackLocale: 'en',
    user: 'user' in options ? options.user : DEFAULT_CLIENT_USER,
  } as unknown as PayloadRequest

  const response = (await meditationLectures.handler(req)) as Response
  const isRedirect = response.status >= 300 && response.status < 400
  const body = isRedirect ? null : await response.json()
  return { status: response.status, headers: response.headers, body }
}

describe('meditationLectures endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let meditation: Meditation

  let nodeA: SubtleSystemNode
  let nodeB: SubtleSystemNode
  let nodeC: SubtleSystemNode

  let frameA: Frame
  let frameB: Frame
  let frameC: Frame

  let audience: Audience
  let audienceFilter: string // comma-separated audiences param including `audience`
  let unusedAudience: Audience // matches no lectures — used for the empty-result test
  let userChoice: UserChoice

  let lectureA: Lecture // [nodeA]            ≈ 10s
  let lectureB: Lecture // [nodeC]            → highest weight
  let lectureAB: Lecture // [nodeA, nodeB]    → mid weight
  let lectureNone: Lecture // []
  let lectureUC: Lecture // [nodeA] + userChoice
  let lectureUCNone: Lecture // []         + userChoice (zero weight; only kept under userChoice query)
  let lectureNoAudience: Lecture // [nodeA] but no audience

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    nodeA = await testData.createSubtleSystemNode(payload, {}, { slug: 'mooladhara' })
    nodeB = await testData.createSubtleSystemNode(payload, {}, { slug: 'anahat' })
    nodeC = await testData.createSubtleSystemNode(payload, {}, { slug: 'sahasrara' })

    frameA = await testData.createFrame(payload, { subtleSystemNode: nodeA.id })
    frameB = await testData.createFrame(payload, { subtleSystemNode: nodeB.id })
    frameC = await testData.createFrame(payload, { subtleSystemNode: nodeC.id })

    meditation = await testData.createMeditation(payload, undefined, {
      title: 'Topic-overlap test meditation',
    })

    // Update frames after creation so the afterChange hook runs and the
    // weights cache populates. audio-42s.mp3 → duration ≈ 42s.
    // Frames at [0, 10, 25] over ~42s yields:
    //   nodeA (mooladhara): 10s   (0→10)
    //   nodeB (anahat):     15s   (10→25)
    //   nodeC (sahasrara):  ~17s  (25→duration)
    meditation = (await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: {
        frames: [
          { id: frameA.id, timestamp: 0 },
          { id: frameB.id, timestamp: 10 },
          { id: frameC.id, timestamp: 25 },
        ] as unknown as Meditation['frames'],
      },
      locale: 'en',
    })) as Meditation

    audience = await testData.createAudience(payload, {
      label: 'Everyone',
      rules: { logic: 'AND', pathProgress: { min: 0, max: 100 } },
    })
    audienceFilter = String(audience.id)

    unusedAudience = await testData.createAudience(payload, {
      label: 'Unused',
      rules: {},
    })

    userChoice = await testData.createUserChoice(payload, { title: 'Stress relief' })

    lectureA = await testData.createLecture(
      payload,
      {},
      { title: 'Lecture A', audiences: [audience.id], subtleSystemNodes: [nodeA.id] },
    )
    lectureB = await testData.createLecture(
      payload,
      {},
      { title: 'Lecture B', audiences: [audience.id], subtleSystemNodes: [nodeC.id] },
    )
    lectureAB = await testData.createLecture(
      payload,
      {},
      {
        title: 'Lecture AB',
        audiences: [audience.id],
        subtleSystemNodes: [nodeA.id, nodeB.id],
      },
    )
    lectureNone = await testData.createLecture(
      payload,
      {},
      { title: 'Lecture None', audiences: [audience.id], subtleSystemNodes: [] },
    )
    lectureUC = await testData.createLecture(
      payload,
      {},
      {
        title: 'Lecture UC',
        audiences: [audience.id],
        subtleSystemNodes: [nodeA.id],
        userChoices: [userChoice.id],
      },
    )
    lectureUCNone = await testData.createLecture(
      payload,
      {},
      {
        title: 'Lecture UC None',
        audiences: [audience.id],
        subtleSystemNodes: [],
        userChoices: [userChoice.id],
      },
    )
    lectureNoAudience = await testData.createLecture(
      payload,
      {},
      { title: 'Lecture No Audience', audiences: [], subtleSystemNodes: [nodeA.id] },
    )
  }, 60000)

  afterAll(async () => {
    await cleanup()
  })

  it('cached weights are populated by the meditation afterChange hook', async () => {
    const m = (await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
      locale: 'en',
    })) as Meditation
    const weights = m.subtleSystemNodeWeights as Record<string, number> | null
    expect(weights).not.toBeNull()
    expect(weights?.mooladhara).toBeGreaterThan(0)
    expect(weights?.anahat).toBeGreaterThan(0)
    expect(weights?.sahasrara).toBeGreaterThan(0)
    // Relative order: sahasrara (last frame, longest tail) > anahat > mooladhara
    expect(weights!.sahasrara).toBeGreaterThan(weights!.anahat)
    expect(weights!.anahat).toBeGreaterThan(weights!.mooladhara)
  })

  it('recomputes cached weights when timestamps change but frame IDs do not', async () => {
    try {
      await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: {
          frames: [
            { id: frameA.id, timestamp: 0 },
            { id: frameB.id, timestamp: 5 },
            { id: frameC.id, timestamp: 25 },
          ] as unknown as Meditation['frames'],
        },
        locale: 'en',
      })

      const updated = (await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
        locale: 'en',
      })) as Meditation
      const weights = updated.subtleSystemNodeWeights as Record<string, number>
      expect(weights.mooladhara).toBe(5)
      expect(weights.anahat).toBe(20)
    } finally {
      await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: {
          frames: [
            { id: frameA.id, timestamp: 0 },
            { id: frameB.id, timestamp: 10 },
            { id: frameC.id, timestamp: 25 },
          ] as unknown as Meditation['frames'],
        },
        locale: 'en',
      })
    }
  })

  it('returns lectures sorted by descending overlap weight', async () => {
    const { status, body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    expect(status).toBe(200)
    const docs = (body as { docs: LecturePlayerData[] }).docs

    // Order:
    //   lectureAB → nodeA + nodeB ≈ 25s
    //   lectureB  → nodeC          ≈ 17s
    //   lectureA  → nodeA          ≈ 10s
    //   lectureUC → nodeA          ≈ 10s   (tie with lectureA; tie-break by id asc)
    //   lectureNone, lectureUCNone, lectureNoAudience excluded
    //   (zero weight without userChoice, or no audience)
    const ids = docs.map((d) => d.id)
    expect(ids[0]).toBe(lectureAB.id)
    expect(ids[1]).toBe(lectureB.id)
    expect(ids.slice(2, 4).sort()).toEqual([lectureA.id, lectureUC.id].sort())
    expect(ids).not.toContain(lectureNone.id)
    expect(ids).not.toContain(lectureUCNone.id)
    expect(ids).not.toContain(lectureNoAudience.id)
  })

  it('is deterministic across repeated calls', async () => {
    const a = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    const b = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    expect((a.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)).toEqual(
      (b.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id),
    )
  })

  it('userChoice returns all matching lectures, ranking userChoice group first (#343)', async () => {
    // With userChoice set, candidates are lectures that either carry the
    // userChoice tag OR have positive subtle-system-node overlap with the
    // meditation. The result is split into two groups:
    //   Group 1 (userChoice-tagged, by weight): lectureUC (≈10s), lectureUCNone (0s)
    //   Group 2 (non-userChoice, positive weight): lectureAB (≈25s), lectureB (≈17s), lectureA (≈10s)
    const { status, body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10, userChoice: userChoice.id },
      { defaultAudiences: audienceFilter },
    )
    expect(status).toBe(200)
    const docs = (body as { docs: LecturePlayerData[] }).docs
    expect(docs.map((d) => d.id)).toEqual([
      lectureUC.id,
      lectureUCNone.id,
      lectureAB.id,
      lectureB.id,
      lectureA.id,
    ])
  })

  it('excludedLectureIds removes the listed lectures', async () => {
    const { body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10, excludedLectureIds: `${lectureAB.id},${lectureB.id}` },
      { defaultAudiences: audienceFilter },
    )
    const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
    expect(ids).not.toContain(lectureAB.id)
    expect(ids).not.toContain(lectureB.id)
    expect(ids).toContain(lectureA.id)
  })

  it('userChoice + excludedLectureIds removes excluded lectures from both groups', async () => {
    // Exclude the weighted userChoice match — zero-weight match stays in Group 1;
    // positive-weight non-userChoice lectures still appear in Group 2.
    const a = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10, userChoice: userChoice.id, excludedLectureIds: `${lectureUC.id}` },
      { defaultAudiences: audienceFilter },
    )
    expect((a.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)).toEqual([
      lectureUCNone.id,
      lectureAB.id,
      lectureB.id,
      lectureA.id,
    ])
    // Exclude both userChoice lectures — only Group 2 remains.
    const b = await callEndpoint(
      payload,
      meditation.id,
      {
        limit: 10,
        userChoice: userChoice.id,
        excludedLectureIds: `${lectureUC.id},${lectureUCNone.id}`,
      },
      { defaultAudiences: audienceFilter },
    )
    expect((b.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)).toEqual([
      lectureAB.id,
      lectureB.id,
      lectureA.id,
    ])
  })

  it('redirects (307) when excludedLectureIds causes an empty result (#349)', async () => {
    // Exclude every lecture that would match the audience filter — result should
    // be a 307 redirect to the same URL with limit=1 and excludedLectureIds gone.
    const excludedIds = [
      lectureA.id,
      lectureB.id,
      lectureAB.id,
      lectureNone.id,
      lectureUC.id,
      lectureUCNone.id,
    ].join(',')
    const { status, headers } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10, excludedLectureIds: excludedIds },
      { defaultAudiences: audienceFilter },
    )
    expect(status).toBe(307)
    const location = headers.get('Location')
    expect(location).not.toBeNull()
    const redirected = new URL(location!)
    expect(redirected.searchParams.has('excludedLectureIds')).toBe(false)
    expect(redirected.searchParams.get('limit')).toBe('1')
    expect(redirected.searchParams.get('audiences')).toBe(audienceFilter)
  })

  it('does not redirect when empty result is not caused by excludedLectureIds (#349)', async () => {
    // No excludedLectureIds — empty result stays as { docs: [] } not a redirect.
    const { status, body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      { defaultAudiences: String(unusedAudience.id) },
    )
    expect(status).toBe(200)
    expect((body as { docs: LecturePlayerData[] }).docs).toEqual([])
  })

  it('redirect preserves userChoice param in Location URL (#349)', async () => {
    // When userChoice is included and all eligible lectures are excluded, the
    // redirect Location URL must retain userChoice so the fallback request
    // still applies the same tag filter.
    const excludedIds = [
      lectureA.id,
      lectureB.id,
      lectureAB.id,
      lectureNone.id,
      lectureUC.id,
      lectureUCNone.id,
    ].join(',')
    const { status, headers } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10, excludedLectureIds: excludedIds, userChoice: userChoice.id },
      { defaultAudiences: audienceFilter },
    )
    expect(status).toBe(307)
    const location = headers.get('Location')
    expect(location).not.toBeNull()
    const redirected = new URL(location!)
    expect(redirected.searchParams.get('userChoice')).toBe(String(userChoice.id))
    expect(redirected.searchParams.has('excludedLectureIds')).toBe(false)
    expect(redirected.searchParams.get('limit')).toBe('1')
  })

  it('userChoice with no positive-weight nodes falls back to userChoices-only filter (#343)', async () => {
    // A meditation with no frames has empty subtleSystemNodeWeights → no
    // positive-weight nodes → the OR filter degrades to userChoices-only.
    // Non-userChoice lectures that have positive chakra overlap with the
    // original meditation must NOT appear here.
    const emptyMeditation = await testData.createMeditation(payload, undefined, {
      title: 'Empty weights meditation',
    })
    const { status, body } = await callEndpoint(
      payload,
      emptyMeditation.id,
      { limit: 10, userChoice: userChoice.id },
      { defaultAudiences: audienceFilter },
    )
    expect(status).toBe(200)
    const ids = (body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)
    expect(ids).toContain(lectureUC.id)
    expect(ids).toContain(lectureUCNone.id)
    expect(ids).not.toContain(lectureAB.id)
    expect(ids).not.toContain(lectureB.id)
    expect(ids).not.toContain(lectureA.id)
  })

  it('returns 404 for unknown meditation', async () => {
    const { status, body } = await callEndpoint(
      payload,
      999999,
      { limit: 10 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    expect(status).toBe(404)
    expect((body as { errors: Array<{ message: string }> }).errors[0].message).toContain(
      'Meditation not found',
    )
  })

  it('returns empty when audiences filter rejects everything', async () => {
    // Caller's resolved audiences don't include `audience`, so no lectures qualify.
    const { status, body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      { defaultAudiences: String(unusedAudience.id) },
    )
    expect(status).toBe(200)
    expect((body as { docs: LecturePlayerData[] }).docs).toEqual([])
  })

  it('returns 400 when audiences is missing', async () => {
    const { status } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      { skipDefaultAudiences: true },
    )
    expect(status).toBe(400)
  })

  it('returns 400 when audiences is empty', async () => {
    const { status } = await callEndpoint(payload, meditation.id, { audiences: '', limit: 10 })
    expect(status).toBe(400)
  })

  it('returns 400 when audiences contains non-numeric values', async () => {
    const { status } = await callEndpoint(payload, meditation.id, {
      audiences: '1,abc',
      limit: 10,
    })
    expect(status).toBe(400)
  })

  describe('auth gate', () => {
    it('rejects unauthenticated callers with 403', async () => {
      const { status, body } = await callEndpoint(
        payload,
        meditation.id,
        { limit: 10 },
        { defaultAudiences: audienceFilter, user: null },
      )
      expect(status).toBe(403)
      expect(body).toEqual({
        errors: [{ message: 'You are not allowed to perform this action.' }],
      })
    })

    it('rejects non-client users (managers) with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        meditation.id,
        { limit: 10 },
        {
          defaultAudiences: audienceFilter,
          user: { id: adminUserId, collection: 'managers', active: true },
        },
      )
      expect(status).toBe(403)
    })

    it('rejects inactive clients with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        meditation.id,
        { limit: 10 },
        {
          defaultAudiences: audienceFilter,
          user: { id: 999, collection: 'clients', active: false },
        },
      )
      expect(status).toBe(403)
    })
  })

  it('sets Cache-Control: public, max-age=600, s-maxage=600 on success', async () => {
    const { status, headers } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      { defaultAudiences: audienceFilter },
    )
    expect(status).toBe(200)
    expect(headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600')
  })

  it('threads client req through internal reads and skips query validation', async () => {
    const client = (await testData.createClient(payload, adminUserId, {
      name: 'Meditation Lectures Forwarding Test',
    })) as Client

    const findSpy = vi.spyOn(payload, 'find')
    try {
      const { status } = await callEndpoint(
        payload,
        meditation.id,
        { limit: 5 },
        {
          defaultAudiences: audienceFilter,
          user: { id: client.id, collection: 'clients', active: true },
        },
      )
      expect(status).toBe(200)

      const lecturesCall = findSpy.mock.calls.find(
        ([args]) => (args as { collection?: string }).collection === 'lectures',
      )
      expect(lecturesCall).toBeDefined()
      const forwardedReq = (
        lecturesCall![0] as {
          req?: { user?: { id: unknown; collection: string }; context?: Record<string, unknown> }
        }
      ).req
      expect(forwardedReq?.user?.id).toBe(client.id)
      expect(forwardedReq?.user?.collection).toBe('clients')
      expect(forwardedReq?.context?.['skipClientQueryValidation']).toBe(true)
    } finally {
      findSpy.mockRestore()
    }
  })

  it('treats unsorted/duplicated audiences as equivalent to the canonical sorted form', async () => {
    const messy = `${audience.id},${audience.id}`
    const a = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    const b = await callEndpoint(payload, meditation.id, { audiences: messy, limit: 10 })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect((a.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id)).toEqual(
      (b.body as { docs: LecturePlayerData[] }).docs.map((d) => d.id),
    )
  })

  it('emits the flat LecturePlayerData shape', async () => {
    const { body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 1 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    const docs = (body as { docs: LecturePlayerData[] }).docs
    expect(docs.length).toBe(1)
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
    expect(Object.keys(docs[0]).sort()).toEqual(expectedKeys)
  })

  it('ad-hoc compute when cached weights are null', async () => {
    // Wipe the cached weights via direct DB update with the skip flag so the
    // afterChange hook doesn't immediately repopulate them. The endpoint
    // should still rank correctly by computing on the fly — and (per
    // GET-is-side-effect-free) leave the cache untouched.
    await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: { subtleSystemNodeWeights: null },
      context: { skipRecomputeNodeWeights: true },
      locale: 'en',
    })
    const cleared = (await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
      locale: 'en',
    })) as Meditation
    expect(cleared.subtleSystemNodeWeights).toBeFalsy()

    const { status, body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 5 },
      {
        defaultAudiences: audienceFilter,
      },
    )
    expect(status).toBe(200)
    const docs = (body as { docs: LecturePlayerData[] }).docs
    expect(docs.length).toBeGreaterThan(0)

    const stillNull = (await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
      locale: 'en',
    })) as Meditation
    expect(stillNull.subtleSystemNodeWeights).toBeFalsy()

    // Restore the cache for the cascade test that follows.
    const restored = await recomputeWeightsForMeditation(payload, stillNull)
    await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: { subtleSystemNodeWeights: restored },
      context: { skipRecomputeNodeWeights: true },
      locale: 'en',
    })
  })

  it('Frames cascade hook: changing a frame node updates dependent meditation weights', async () => {
    const before = (await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
      locale: 'en',
    })) as Meditation
    const beforeWeights = before.subtleSystemNodeWeights as Record<string, number>
    expect(beforeWeights.mooladhara).toBeGreaterThan(0)
    expect(beforeWeights.kundalini).toBeUndefined()

    // Repoint frameA from mooladhara → kundalini. Cascade hook should
    // recompute weights on every meditation referencing frameA.
    const nodeKundalini = await testData.createSubtleSystemNode(payload, {}, { slug: 'kundalini' })
    await payload.update({
      collection: 'frames',
      id: frameA.id,
      data: { subtleSystemNode: nodeKundalini.id },
    })

    const after = (await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
      locale: 'en',
    })) as Meditation
    const afterWeights = after.subtleSystemNodeWeights as Record<string, number>
    expect(afterWeights.mooladhara).toBeUndefined()
    expect(afterWeights.kundalini).toBeGreaterThan(0)
  })

  describe('fullLectureId audience gating (#341)', () => {
    // Uses the outer `audience` (Everyone) and `userChoice` tag to guarantee
    // clips survive the weight-ranking step regardless of subtleSystemNode overlap.
    // userChoice-tagged lectures are always kept even at weight=0 (#343).
    let parentForGating: Lecture
    let clipEligibleParent: Lecture
    let parentIneligible: Lecture // tagged only to a separate audience
    let clipIneligibleParent: Lecture
    let separateAudienceId: number

    beforeAll(async () => {
      const separateAudience = await testData.createAudience(payload, {
        label: 'Separate (gating test)',
        rules: {},
      })
      separateAudienceId = separateAudience.id

      // Parent in the same eligible set (audience) — fullLectureId should be exposed.
      parentForGating = await testData.createLecture(
        payload,
        {},
        {
          title: 'Parent (gating eligible)',
          audiences: [audience.id],
          subtleSystemNodes: [nodeA.id],
        },
      )
      // Clip referencing eligible parent. Tagged with userChoice so the endpoint
      // includes it even at weight=0 (clips don't always inherit nodeA weight).
      clipEligibleParent = await testData.createLectureExcerpt(
        payload,
        { fullLecture: parentForGating.id },
        {
          title: 'Clip (eligible parent)',
          audiences: [audience.id],
          userChoices: [userChoice.id],
        },
      )

      // Parent tagged only to separateAudience — ineligible when requesting `audience`.
      parentIneligible = await testData.createLecture(
        payload,
        {},
        {
          title: 'Parent (ineligible)',
          audiences: [separateAudience.id],
          subtleSystemNodes: [nodeA.id],
        },
      )
      // Clip of ineligible parent, itself tagged to the eligible `audience` + userChoice.
      clipIneligibleParent = await testData.createLectureExcerpt(
        payload,
        { fullLecture: parentIneligible.id },
        {
          title: 'Clip (ineligible parent)',
          audiences: [audience.id],
          userChoices: [userChoice.id],
        },
      )
    })

    it('returns fullLectureId when the parent lecture is in the eligible audience set', async () => {
      const { body } = await callEndpoint(
        payload,
        meditation.id,
        // Pass userChoice so clips survive the weight ranking (userChoice-tagged
        // lectures are always kept regardless of subtleSystemNode overlap).
        { limit: 100, userChoice: userChoice.id },
        { defaultAudiences: audienceFilter },
      )
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === clipEligibleParent.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.fullLectureId).toBe(parentForGating.id)
    })

    it('returns fullLectureId: null when the parent lecture is NOT in the eligible audience set', async () => {
      const { body } = await callEndpoint(
        payload,
        meditation.id,
        { limit: 100, userChoice: userChoice.id },
        { defaultAudiences: audienceFilter },
      )
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === clipIneligibleParent.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.fullLectureId).toBeNull()
    })

    it('exposes fullLectureId when the eligible set includes both the clip and parent audience', async () => {
      // Add separateAudience to the eligible set so the ineligible parent now qualifies.
      const { body } = await callEndpoint(
        payload,
        meditation.id,
        {
          audiences: `${audienceFilter},${separateAudienceId}`,
          limit: 100,
          userChoice: userChoice.id,
        },
        { skipDefaultAudiences: true },
      )
      const clip = (body as { docs: LecturePlayerData[] }).docs.find(
        (d) => d.id === clipIneligibleParent.id,
      )
      expect(clip).toBeDefined()
      expect(clip!.fullLectureId).toBe(parentIneligible.id)
    })
  })
})
