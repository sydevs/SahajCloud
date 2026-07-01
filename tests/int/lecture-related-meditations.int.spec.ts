import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { lectureRelatedMeditations } from '@/collections/Lectures/endpoints/relatedMeditations'
import type { MeditationCardData } from '@/lib/meditations/meditationShape'
import type { Frame, Lecture, Meditation, SubtleSystemNode } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// createLecture triggers populateFromNirmalaVidya, which fetches from the NV API.
// Stub it so full-lecture creation doesn't hit the network.
vi.mock('@/lib/lectures/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/lectures/nirmalaVidyaApi')>()
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

const DEFAULT_CLIENT_USER = { id: 0, collection: 'clients', _status: 'published' }

type ResponseBody = { docs: MeditationCardData[]; source: string; relevanceCount: number }

async function callEndpoint(
  payload: Payload,
  lectureId: number | string,
  query: Record<string, string | number> = {},
  options: {
    user?: { id: number | string; collection: string; _status?: 'published' | 'draft' } | null
  } = {},
): Promise<{ status: number; headers: Headers; body: ResponseBody | unknown }> {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    searchParams.set(key, String(value))
  }
  const url = `http://localhost:3000/api/lectures/${lectureId}/related-meditations?${searchParams.toString()}`
  const req = {
    url,
    payload,
    query,
    headers: new Headers(),
    routeParams: { id: lectureId },
    // Mirror production HTTP-request defaulting: no explicit `?locale=` ⇒ 'en'.
    locale: 'en',
    fallbackLocale: 'en',
    user: 'user' in options ? options.user : DEFAULT_CLIENT_USER,
  } as unknown as PayloadRequest

  const response = (await lectureRelatedMeditations.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, headers: response.headers, body }
}

/** Attach frames to a meditation so its subtleSystemNodeWeights cache populates. */
async function setFrames(
  payload: Payload,
  meditationId: number,
  frames: Array<{ id: number; timestamp: number }>,
): Promise<void> {
  await payload.update({
    collection: 'meditations',
    id: meditationId,
    data: { frames: frames as unknown as Meditation['frames'] },
    locale: 'en',
  })
}

describe('lectureRelatedMeditations endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let nodeA: SubtleSystemNode // mooladhara
  let nodeB: SubtleSystemNode // anahat
  let nodeC: SubtleSystemNode // sahasrara

  let frameA: Frame
  let frameB: Frame
  let frameC: Frame

  // Anchor lectures.
  let anchorLecture: Lecture // subtleSystemNodes [nodeA, nodeB]
  let noNodesLecture: Lecture // subtleSystemNodes []

  // Candidate daily meditations (all same-locale 'en'). Scores are over the
  // anchor's node set S = { mooladhara, anahat }:
  let medHigh: Meditation // frames A@0, B@21 → S-score ≈ full duration
  let medMid: Meditation // frames A@0, C@10 → S-score ≈ mooladhara only
  let medZero: Meditation // frames C@0     → S-score 0 (fallback only)

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

    anchorLecture = await testData.createLecture(
      payload,
      {},
      { title: 'Anchor Lecture', subtleSystemNodes: [nodeA.id, nodeB.id] },
    )
    noNodesLecture = await testData.createLecture(
      payload,
      {},
      { title: 'No-nodes Lecture', subtleSystemNodes: [] },
    )

    // Create in order so createdAt ordering is medHigh < medMid < medZero.
    medHigh = await testData.createMeditation(payload, undefined, { title: 'Med High' })
    await setFrames(payload, medHigh.id, [
      { id: frameA.id, timestamp: 0 },
      { id: frameB.id, timestamp: 21 },
    ])

    medMid = await testData.createMeditation(payload, undefined, { title: 'Med Mid' })
    await setFrames(payload, medMid.id, [
      { id: frameA.id, timestamp: 0 },
      { id: frameC.id, timestamp: 10 },
    ])

    medZero = await testData.createMeditation(payload, undefined, { title: 'Med Zero' })
    await setFrames(payload, medZero.id, [{ id: frameC.id, timestamp: 0 }])
  }, 60000)

  afterAll(async () => {
    await cleanup()
  })

  it('populates the meditation weights cache used for scoring', async () => {
    const m = (await payload.findByID({
      collection: 'meditations',
      id: medHigh.id,
      locale: 'en',
    })) as Meditation
    const weights = m.subtleSystemNodeWeights as Record<string, number> | null
    expect(weights?.mooladhara).toBeGreaterThan(0)
    expect(weights?.anahat).toBeGreaterThan(0)
  })

  it('ranks daily meditations by node-weight overlap with the lecture', async () => {
    const { status, body } = await callEndpoint(payload, anchorLecture.id, { limit: 10 })
    expect(status).toBe(200)
    const res = body as ResponseBody
    // medHigh (overlaps both nodes) outranks medMid (overlaps one); medZero has
    // no overlap and is not a relevance match.
    expect(res.relevanceCount).toBe(2)
    expect(res.docs[0].id).toBe(medHigh.id)
    expect(res.docs[1].id).toBe(medMid.id)
    // medZero still appears — as a recency top-up — so source flips to fallback.
    expect(res.source).toBe('fallback')
    expect(res.docs.map((d) => d.id)).toContain(medZero.id)
  })

  it('returns pure relevance (no top-up) when relevance fills the limit', async () => {
    const { status, body } = await callEndpoint(payload, anchorLecture.id, { limit: 2 })
    expect(status).toBe(200)
    const res = body as ResponseBody
    expect(res.source).toBe('relevance')
    expect(res.relevanceCount).toBe(2)
    expect(res.docs.map((d) => d.id)).toEqual([medHigh.id, medMid.id])
    // The weighted-then-sliced ranking keeps the zero-overlap meditation out.
    expect(res.docs.map((d) => d.id)).not.toContain(medZero.id)
  })

  it('excludes excludedMeditationIds from both relevance and fallback', async () => {
    const { body } = await callEndpoint(payload, anchorLecture.id, {
      limit: 10,
      excludedMeditationIds: String(medHigh.id),
    })
    const res = body as ResponseBody
    const ids = res.docs.map((d) => d.id)
    expect(ids).not.toContain(medHigh.id)
    expect(ids).toContain(medMid.id)
    expect(res.relevanceCount).toBe(1)
  })

  it('tops up with daily/same-locale recents when the lecture has no tagged nodes', async () => {
    const { status, body } = await callEndpoint(payload, noNodesLecture.id, { limit: 10 })
    expect(status).toBe(200)
    const res = body as ResponseBody
    expect(res.source).toBe('fallback')
    expect(res.relevanceCount).toBe(0)
    const ids = res.docs.map((d) => d.id)
    expect(ids).toContain(medHigh.id)
    expect(ids).toContain(medMid.id)
    expect(ids).toContain(medZero.id)
  })

  it('emits the flat MeditationCardData shape with no null title/duration/thumbnail', async () => {
    const { body } = await callEndpoint(payload, anchorLecture.id, { limit: 1 })
    const docs = (body as ResponseBody).docs
    expect(docs.length).toBe(1)
    expect(Object.keys(docs[0]).sort()).toEqual([
      'durationMinutes',
      'id',
      'narratorName',
      'thumbnailUrl',
      'title',
    ])
    const card = docs[0]
    expect(typeof card.title).toBe('string')
    expect(card.title.length).toBeGreaterThan(0)
    expect(typeof card.durationMinutes).toBe('number')
    expect(typeof card.thumbnailUrl).toBe('string')
    expect(card.thumbnailUrl.length).toBeGreaterThan(0)
    expect(card.narratorName).toBe('Test Narrator')
  })

  it('returns 404 for an unknown lecture', async () => {
    const { status, body } = await callEndpoint(payload, 999999, { limit: 10 })
    expect(status).toBe(404)
    expect((body as { errors: Array<{ message: string }> }).errors[0].message).toContain(
      'Lecture not found',
    )
  })

  it('sets Cache-Control: public, max-age=600, s-maxage=600 on success', async () => {
    const { status, headers } = await callEndpoint(payload, anchorLecture.id, { limit: 10 })
    expect(status).toBe(200)
    expect(headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600')
  })

  describe('limit validation', () => {
    it('returns 400 when limit is missing', async () => {
      const { status } = await callEndpoint(payload, anchorLecture.id, {})
      expect(status).toBe(400)
    })

    it('returns 400 when limit is below 1', async () => {
      const { status } = await callEndpoint(payload, anchorLecture.id, { limit: 0 })
      expect(status).toBe(400)
    })

    it('returns 400 when limit is above 100', async () => {
      const { status } = await callEndpoint(payload, anchorLecture.id, { limit: 101 })
      expect(status).toBe(400)
    })

    it('returns 400 when limit is non-numeric', async () => {
      const { status } = await callEndpoint(payload, anchorLecture.id, { limit: 'abc' })
      expect(status).toBe(400)
    })
  })

  describe('auth gate', () => {
    it('rejects unauthenticated callers with 403', async () => {
      const { status, body } = await callEndpoint(
        payload,
        anchorLecture.id,
        { limit: 10 },
        { user: null },
      )
      expect(status).toBe(403)
      expect(body).toEqual({
        errors: [{ message: 'You are not allowed to perform this action.' }],
      })
    })

    it('rejects non-client users (managers) with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        anchorLecture.id,
        { limit: 10 },
        { user: { id: adminUserId, collection: 'managers' } },
      )
      expect(status).toBe(403)
    })

    it('rejects inactive (draft) clients with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        anchorLecture.id,
        { limit: 10 },
        { user: { id: 999, collection: 'clients', _status: 'draft' } },
      )
      expect(status).toBe(403)
    })
  })
})
