import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type {
  Audience,
  Frame,
  Lecture,
  LectureClip,
  Meditation,
  SubtleSystemNode,
  UserChoice,
} from '@/payload-types'

import { meditationLectures } from '@/endpoints/meditationLectures'
import { recomputeWeightsForMeditation } from '@/hooks/meditationHooks'
import type { LectureClipPlayerData } from '@/lib/lectureClipShape'

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

const AUDIENCE_DEFAULTS = {
  pathProgress: 3,
  meditationsPerWeek: 1,
  totalMeditationsViewed: 5,
  totalLecturesViewed: 0,
}

async function callEndpoint(
  payload: Payload,
  meditationId: number | string,
  query: Record<string, string | number | boolean> = {},
  options: { skipAudienceDefaults?: boolean } = {},
): Promise<{ status: number; body: { docs: LectureClipPlayerData[] } | unknown }> {
  const finalQuery = options.skipAudienceDefaults
    ? query
    : { ...AUDIENCE_DEFAULTS, ...query }
  const req = {
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: { id: meditationId },
    // Mirror production HTTP-request defaulting: no explicit `?locale=` ⇒ 'en'.
    // Without this, localized fields (lectureClip.title) come back as
    // `{ en: '...' }` objects.
    locale: 'en',
    fallbackLocale: 'en',
  } as unknown as PayloadRequest

  const response = (await meditationLectures.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('meditationLectures endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let meditation: Meditation

  let nodeA: SubtleSystemNode
  let nodeB: SubtleSystemNode
  let nodeC: SubtleSystemNode

  let frameA: Frame
  let frameB: Frame
  let frameC: Frame

  let audience: Audience
  let userChoice: UserChoice

  let lectureA: Lecture // [nodeA]
  let lectureB: Lecture // [nodeC]  → highest weight
  let lectureAB: Lecture // [nodeA, nodeB] → mid weight
  let lectureNone: Lecture // []
  let lectureUC: Lecture // [nodeA] + userChoice

  let clipA: LectureClip
  let clipB: LectureClip
  let clipAB: LectureClip
  let clipNone: LectureClip
  let clipUC: LectureClip
  let clipNoAudience: LectureClip

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

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

    userChoice = await testData.createUserChoice(payload, { title: 'Stress relief' })

    lectureA = await testData.createLecture(payload, {}, { title: 'Lecture A' })
    lectureB = await testData.createLecture(payload, {}, { title: 'Lecture B' })
    lectureAB = await testData.createLecture(payload, {}, { title: 'Lecture AB' })
    lectureNone = await testData.createLecture(payload, {}, { title: 'Lecture None' })
    lectureUC = await testData.createLecture(
      payload,
      {},
      { title: 'Lecture UC', userChoices: [userChoice.id] },
    )

    clipA = await testData.createLectureClip(
      payload,
      { lecture: lectureA.id },
      { title: 'Clip A', audiences: [audience.id], subtleSystemNodes: [nodeA.id] },
    )
    clipB = await testData.createLectureClip(
      payload,
      { lecture: lectureB.id },
      { title: 'Clip B', audiences: [audience.id], subtleSystemNodes: [nodeC.id] },
    )
    clipAB = await testData.createLectureClip(
      payload,
      { lecture: lectureAB.id },
      { title: 'Clip AB', audiences: [audience.id], subtleSystemNodes: [nodeA.id, nodeB.id] },
    )
    clipNone = await testData.createLectureClip(
      payload,
      { lecture: lectureNone.id },
      { title: 'Clip None', audiences: [audience.id], subtleSystemNodes: [] },
    )
    clipUC = await testData.createLectureClip(
      payload,
      { lecture: lectureUC.id },
      { title: 'Clip UC', audiences: [audience.id], subtleSystemNodes: [nodeA.id] },
    )
    clipNoAudience = await testData.createLectureClip(
      payload,
      { lecture: lectureA.id },
      { title: 'Clip No Audience', audiences: [], subtleSystemNodes: [nodeA.id] },
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

  it('returns clips sorted by descending overlap weight', async () => {
    const { status, body } = await callEndpoint(payload, meditation.id, { limit: 10 })
    expect(status).toBe(200)
    const docs = (body as { docs: LectureClipPlayerData[] }).docs

    // Order:
    //   clipAB  → nodeA + nodeB ≈ 25s
    //   clipB   → nodeC          ≈ 17s
    //   clipA   → nodeA          ≈ 10s
    //   clipUC  → nodeA          ≈ 10s   (tie with clipA; tie-break by id asc)
    //   clipNone, clipNoAudience excluded (zero weight / no audience)
    const ids = docs.map((d) => d.id)
    expect(ids[0]).toBe(clipAB.id)
    expect(ids[1]).toBe(clipB.id)
    // The remaining tie-broken pair: clipA and clipUC (both weight ≈ 10).
    expect(ids.slice(2, 4).sort()).toEqual([clipA.id, clipUC.id].sort())
    expect(ids).not.toContain(clipNone.id)
    expect(ids).not.toContain(clipNoAudience.id)
  })

  it('is deterministic across repeated calls', async () => {
    const a = await callEndpoint(payload, meditation.id, { limit: 10 })
    const b = await callEndpoint(payload, meditation.id, { limit: 10 })
    expect((a.body as { docs: LectureClipPlayerData[] }).docs.map((d) => d.id)).toEqual(
      (b.body as { docs: LectureClipPlayerData[] }).docs.map((d) => d.id),
    )
  })

  it('userChoice gates candidates to clips whose parent has that user-choice', async () => {
    const { status, body } = await callEndpoint(payload, meditation.id, {
      limit: 10,
      userChoice: userChoice.id,
    })
    expect(status).toBe(200)
    const docs = (body as { docs: LectureClipPlayerData[] }).docs
    expect(docs.map((d) => d.id)).toEqual([clipUC.id])
  })

  it('excludedLectureClipIds removes the listed clips', async () => {
    const { body } = await callEndpoint(payload, meditation.id, {
      limit: 10,
      excludedLectureClipIds: `${clipAB.id},${clipB.id}`,
    })
    const ids = (body as { docs: LectureClipPlayerData[] }).docs.map((d) => d.id)
    expect(ids).not.toContain(clipAB.id)
    expect(ids).not.toContain(clipB.id)
    expect(ids).toContain(clipA.id)
  })

  it('returns 404 for unknown meditation', async () => {
    const { status, body } = await callEndpoint(payload, 999999, { limit: 10 })
    expect(status).toBe(404)
    expect((body as { errors: Array<{ message: string }> }).errors[0].message).toContain(
      'Meditation not found',
    )
  })

  it('returns empty when audience filter rejects everything', async () => {
    // Use a pathProgress outside the [0,100] range so no audience matches
    const { status, body } = await callEndpoint(
      payload,
      meditation.id,
      { limit: 10, pathProgress: 999 },
    )
    expect(status).toBe(200)
    expect((body as { docs: LectureClipPlayerData[] }).docs).toEqual([])
  })

  it('emits the flat LectureClipPlayerData shape', async () => {
    const { body } = await callEndpoint(payload, meditation.id, { limit: 1 })
    const docs = (body as { docs: LectureClipPlayerData[] }).docs
    expect(docs.length).toBe(1)
    const expectedKeys = [
      'duration',
      'endTime',
      'id',
      'lectureId',
      'startTime',
      'subtitles',
      'thumbnailUrl',
      'title',
      'type',
      'videoUrl',
    ]
    expect(Object.keys(docs[0]).sort()).toEqual(expectedKeys)
    expect(docs[0].type).toBe('lecture-clip')
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

    const { status, body } = await callEndpoint(payload, meditation.id, { limit: 5 })
    expect(status).toBe(200)
    const docs = (body as { docs: LectureClipPlayerData[] }).docs
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
    const nodeKundalini = await testData.createSubtleSystemNode(
      payload,
      {},
      { slug: 'kundalini' },
    )
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
})
