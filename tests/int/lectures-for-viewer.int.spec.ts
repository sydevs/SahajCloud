import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Client, Image, Lecture, LectureTag } from '@/payload-types'

import { lecturesForViewer } from '@/endpoints'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Prevent live Nirmala Vidya API calls from the populateFromNirmalaVidya hook
// fired by testData.createLecture.
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(
    join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'),
  )
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: new Uint8Array(imgBuffer),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail.jpg',
      size: imgBuffer.length,
    }),
  }
})

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  user?: { id: number | string; collection: string },
): Promise<{ status: number; body: unknown }> {
  const req = {
    payload,
    query,
    headers: new Headers(),
    routeParams: {},
    user,
  } as unknown as PayloadRequest

  const response = (await lecturesForViewer.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('lecturesForViewer endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let tagBeginner: LectureTag
  let tagIntermediate: LectureTag
  let tagViewers10: LectureTag

  let lectureBeginnerOnly: Lecture
  let lectureBeginnerAndIntermediate: Lecture
  let lectureBeginnerAndViewers10: Lecture
  let lectureUntagged: Lecture
  let lectureDraftBeginner: Lecture

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    tagBeginner = await testData.createLectureTag(payload, {
      label: 'Beginner',
      rules: { logic: 'AND', pathProgress: { min: 0, max: 5 } },
    })
    tagIntermediate = await testData.createLectureTag(payload, {
      label: 'Intermediate',
      rules: { logic: 'AND', pathProgress: { min: 5, max: 10 } },
    })
    tagViewers10 = await testData.createLectureTag(payload, {
      label: 'Viewers10',
      rules: { logic: 'AND', totalLecturesViewed: { min: 10 } },
    })

    // Share a single thumbnail image across all fixtures.
    const thumb = (await testData.createMediaImage(payload, {
      alt: 'Shared lecture thumbnail',
    })) as Image

    lectureBeginnerOnly = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      { title: 'Beginner Only', tags: [tagBeginner.id], _status: 'published' },
    )
    lectureBeginnerAndIntermediate = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      {
        title: 'Beginner + Intermediate',
        tags: [tagBeginner.id, tagIntermediate.id],
        _status: 'published',
      },
    )
    lectureBeginnerAndViewers10 = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      {
        title: 'Beginner + Viewers10',
        tags: [tagBeginner.id, tagViewers10.id],
        _status: 'published',
      },
    )
    lectureUntagged = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      { title: 'Untagged', tags: [], _status: 'published' },
    )
    lectureDraftBeginner = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      { title: 'Draft Beginner', tags: [tagBeginner.id], _status: 'draft' },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns 400 when limit is missing', async () => {
    const { status } = await callEndpoint(payload, {})
    expect(status).toBe(400)
  })

  it('returns 400 when limit is out of range', async () => {
    const low = await callEndpoint(payload, { limit: 0 })
    expect(low.status).toBe(400)
    const high = await callEndpoint(payload, { limit: 101 })
    expect(high.status).toBe(400)
  })

  it('returns 400 when a numeric param is non-numeric', async () => {
    const { status } = await callEndpoint(payload, {
      limit: 10,
      pathProgress: 'not-a-number',
    })
    expect(status).toBe(400)
  })

  it('excludes draft lectures', async () => {
    const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
    const ids = (body as { docs: Lecture[] }).docs.map((l) => l.id)
    expect(ids).not.toContain(lectureDraftBeginner.id)
  })

  it('excludes untagged lectures', async () => {
    const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
    const ids = (body as { docs: Lecture[] }).docs.map((l) => l.id)
    expect(ids).not.toContain(lectureUntagged.id)
  })

  it('returns lectures whose single tag passes (pathProgress=3 → Beginner only)', async () => {
    const { status, body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
    expect(status).toBe(200)
    const ids = (body as { docs: Lecture[] }).docs.map((l) => l.id)
    expect(ids).toContain(lectureBeginnerOnly.id)
  })

  it('returns lectures whose ALL tags pass (pathProgress=3, totalLecturesViewed=20)', async () => {
    const { body } = await callEndpoint(payload, {
      limit: 100,
      pathProgress: 3,
      totalLecturesViewed: 20,
    })
    const ids = (body as { docs: Lecture[] }).docs.map((l) => l.id)
    expect(ids).toContain(lectureBeginnerOnly.id)
    expect(ids).toContain(lectureBeginnerAndViewers10.id)
    // Intermediate (pathProgress 5-10) fails for pathProgress=3 → excluded.
    expect(ids).not.toContain(lectureBeginnerAndIntermediate.id)
  })

  it('excludes lectures where any single tag fails (key all-pass case)', async () => {
    // pathProgress=3 satisfies Beginner; totalLecturesViewed=0 fails Viewers10.
    // Intermediate (pathProgress min 5) also fails.
    const { body } = await callEndpoint(payload, {
      limit: 100,
      pathProgress: 3,
      totalLecturesViewed: 0,
    })
    const ids = (body as { docs: Lecture[] }).docs.map((l) => l.id)
    expect(ids).toContain(lectureBeginnerOnly.id)
    expect(ids).not.toContain(lectureBeginnerAndIntermediate.id)
    expect(ids).not.toContain(lectureBeginnerAndViewers10.id)
  })

  it('returns empty docs when no tag rules pass (eligibleSet short-circuit)', async () => {
    // pathProgress=99 fails Beginner (0-5) and Intermediate (5-10);
    // totalLecturesViewed=0 fails Viewers10 (min 10). No tags eligible.
    const { status, body } = await callEndpoint(payload, {
      limit: 100,
      pathProgress: 99,
      totalLecturesViewed: 0,
    })
    expect(status).toBe(200)
    expect((body as { docs: Lecture[] }).docs).toEqual([])
  })

  it('respects the limit parameter', async () => {
    const { body } = await callEndpoint(payload, {
      limit: 1,
      pathProgress: 3,
      totalLecturesViewed: 20,
    })
    const docs = (body as { docs: Lecture[] }).docs
    expect(docs).toHaveLength(1)
  })

  it('threads req through both payload.find calls so usage-tracking and rate-limit hooks see the caller', async () => {
    // The hooks applied by usagePlugin read `req.user` to attribute a request
    // to a client. If the endpoint doesn't forward `req`, the hooks fire
    // without a user and silently skip tracking/rate-limiting.
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

      const tagCall = findSpy.mock.calls.find(
        ([args]) => (args as { collection?: string }).collection === 'lecture-tags',
      )
      const lectureCall = findSpy.mock.calls.find(
        ([args]) => (args as { collection?: string }).collection === 'lectures',
      )
      expect(tagCall).toBeDefined()
      expect(lectureCall).toBeDefined()

      const tagReq = (
        tagCall![0] as {
          req?: { user?: { id: unknown; collection: string }; context?: Record<string, unknown> }
        }
      ).req
      expect(tagReq?.user?.id).toBe(client.id)
      expect(tagReq?.user?.collection).toBe('clients')
      expect(tagReq?.context?.viewerData).toEqual({ pathProgress: 3 })

      const lectureReq = (
        lectureCall![0] as { req?: { user?: { id: unknown; collection: string } } }
      ).req
      expect(lectureReq?.user?.id).toBe(client.id)
      expect(lectureReq?.user?.collection).toBe('clients')
    } finally {
      findSpy.mockRestore()
    }
  })

  it('populates relationships at depth 1', async () => {
    const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
    const docs = (body as { docs: Lecture[] }).docs
    const lecture = docs.find((l) => l.id === lectureBeginnerOnly.id)
    expect(lecture).toBeDefined()
    // tags relationship populated to LectureTag objects
    const tags = lecture!.tags ?? []
    expect(tags.length).toBeGreaterThan(0)
    const firstTag = tags[0] as LectureTag
    expect(typeof firstTag).toBe('object')
    expect(firstTag.label).toBe('Beginner')
    // thumbnail relationship populated
    const thumbnail = lecture!.thumbnail as Image
    expect(typeof thumbnail).toBe('object')
    expect(thumbnail.id).toBeDefined()
  })
})
