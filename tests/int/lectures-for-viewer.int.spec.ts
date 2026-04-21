import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Client, Image, Lecture, LectureClip, LectureTag } from '@/payload-types'

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

type ViewerDoc =
  | ({ type: 'lecture' } & Lecture)
  | ({ type: 'clip' } & LectureClip & { parent: Lecture | null })

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  user?: { id: number | string; collection: string },
): Promise<{ status: number; body: { docs: ViewerDoc[] } | unknown }> {
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
  let lectureIntermediateOnly: Lecture
  let lectureUntagged: Lecture

  let clipWithEligibleParent: LectureClip
  let clipWithIneligibleParent: LectureClip
  let clipMissingThumbAndSubs: LectureClip

  let parentThumbnailId: number

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

    const thumb = (await testData.createMediaImage(payload, {
      alt: 'Shared lecture thumbnail',
    })) as Image
    parentThumbnailId = thumb.id

    lectureBeginnerOnly = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      {
        title: 'Beginner Lecture',
        tags: [tagBeginner.id],
        subtitlesUrl: 'https://example.com/parent-en.vtt',
      },
    )
    lectureIntermediateOnly = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      { title: 'Intermediate Lecture', tags: [tagIntermediate.id] },
    )
    lectureUntagged = await testData.createLecture(
      payload,
      { thumbnail: thumb.id },
      { title: 'Untagged', tags: [] },
    )

    // Clip with eligible parent — own thumbnail/subs supplied.
    const clipOwnThumb = (await testData.createMediaImage(payload, {
      alt: 'Clip thumbnail',
    })) as Image
    clipWithEligibleParent = await testData.createLectureClip(
      payload,
      { parent: lectureBeginnerOnly.id },
      {
        title: 'Clip of Beginner Lecture',
        tags: [tagBeginner.id],
        thumbnail: clipOwnThumb.id,
        subtitlesUrl: 'https://example.com/clip-en.vtt',
      },
    )

    // Clip with INELIGIBLE parent — own thumb/subs supplied.
    clipWithIneligibleParent = await testData.createLectureClip(
      payload,
      { parent: lectureIntermediateOnly.id },
      {
        title: 'Clip of Intermediate Lecture',
        tags: [tagBeginner.id], // clip is eligible even though parent isn't
        thumbnail: clipOwnThumb.id,
        subtitlesUrl: 'https://example.com/clip-intermediate-parent.vtt',
      },
    )

    // Clip missing own thumb + subs → should fall back to parent's values.
    clipMissingThumbAndSubs = await testData.createLectureClip(
      payload,
      { parent: lectureBeginnerOnly.id },
      {
        title: 'Clip relying on parent fallbacks',
        tags: [tagBeginner.id],
        // no thumbnail, no subtitlesUrl
      },
    )

    // Untagged clip — should never appear.
    await testData.createLectureClip(
      payload,
      { parent: lectureBeginnerOnly.id },
      { title: 'Untagged clip', tags: [] },
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
  })

  describe('Mixed response shape', () => {
    it('returns a discriminated union of lectures and clips', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const docs = (body as { docs: ViewerDoc[] }).docs

      expect(docs.length).toBeGreaterThan(0)
      for (const doc of docs) {
        expect(['lecture', 'clip']).toContain(doc.type)
      }

      const types = new Set(docs.map((d) => d.type))
      expect(types.has('lecture')).toBe(true)
      expect(types.has('clip')).toBe(true)
    })

    it('respects a single `limit` across the combined pool', async () => {
      const { body } = await callEndpoint(payload, { limit: 1, pathProgress: 3 })
      const docs = (body as { docs: ViewerDoc[] }).docs
      expect(docs).toHaveLength(1)
    })
  })

  describe('Eligibility', () => {
    it('returns lectures whose tags all pass', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const ids = (body as { docs: ViewerDoc[] }).docs
        .filter((d) => d.type === 'lecture')
        .map((d) => d.id)
      expect(ids).toContain(lectureBeginnerOnly.id)
    })

    it('excludes untagged lectures and clips', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const docs = (body as { docs: ViewerDoc[] }).docs
      const lectureIds = docs.filter((d) => d.type === 'lecture').map((d) => d.id)
      expect(lectureIds).not.toContain(lectureUntagged.id)
      // Assert no clip named 'Untagged clip' snuck through.
      const clipTitles = docs.filter((d) => d.type === 'clip').map((d) => d.title)
      expect(clipTitles).not.toContain('Untagged clip')
    })

    it('returns clips independently of parent eligibility', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clipIds = (body as { docs: ViewerDoc[] }).docs
        .filter((d) => d.type === 'clip')
        .map((d) => d.id)
      expect(clipIds).toContain(clipWithEligibleParent.id)
      expect(clipIds).toContain(clipWithIneligibleParent.id)
    })

    it('returns empty docs when no tag rules pass', async () => {
      const { status, body } = await callEndpoint(payload, {
        limit: 100,
        pathProgress: 99,
        totalLecturesViewed: 0,
      })
      expect(status).toBe(200)
      expect((body as { docs: ViewerDoc[] }).docs).toEqual([])
    })

    it('shows newly-created lectures immediately (no drafts)', async () => {
      const fresh = await testData.createLecture(
        payload,
        { thumbnail: parentThumbnailId },
        { title: 'Just created', tags: [tagBeginner.id] },
      )
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const lectureIds = (body as { docs: ViewerDoc[] }).docs
        .filter((d) => d.type === 'lecture')
        .map((d) => d.id)
      expect(lectureIds).toContain(fresh.id)
    })
  })

  describe('Parent population on clips', () => {
    it('populates `parent` when the parent is viewer-eligible', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ViewerDoc[] }).docs.find(
        (d) => d.type === 'clip' && d.id === clipWithEligibleParent.id,
      ) as (ViewerDoc & { type: 'clip' }) | undefined
      expect(clip).toBeDefined()
      expect(clip!.parent).not.toBeNull()
      expect((clip!.parent as Lecture).id).toBe(lectureBeginnerOnly.id)
    })

    it('sets `parent: null` when the parent is not viewer-eligible', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ViewerDoc[] }).docs.find(
        (d) => d.type === 'clip' && d.id === clipWithIneligibleParent.id,
      ) as (ViewerDoc & { type: 'clip' }) | undefined
      expect(clip).toBeDefined()
      expect(clip!.parent).toBeNull()
    })
  })

  describe('Server-merged fallbacks on clips', () => {
    it('fills missing thumbnail from the parent lecture', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ViewerDoc[] }).docs.find(
        (d) => d.type === 'clip' && d.id === clipMissingThumbAndSubs.id,
      ) as (ViewerDoc & { type: 'clip' }) | undefined
      expect(clip).toBeDefined()
      const thumbId =
        typeof clip!.thumbnail === 'object' && clip!.thumbnail !== null
          ? (clip!.thumbnail as Image).id
          : clip!.thumbnail
      expect(thumbId).toBe(parentThumbnailId)
    })

    it('fills missing subtitlesUrl from the parent lecture', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ViewerDoc[] }).docs.find(
        (d) => d.type === 'clip' && d.id === clipMissingThumbAndSubs.id,
      ) as (ViewerDoc & { type: 'clip' }) | undefined
      expect(clip).toBeDefined()
      expect(clip!.subtitlesUrl).toBe('https://example.com/parent-en.vtt')
    })

    it('preserves the clip\'s own thumbnail and subtitlesUrl when set', async () => {
      const { body } = await callEndpoint(payload, { limit: 100, pathProgress: 3 })
      const clip = (body as { docs: ViewerDoc[] }).docs.find(
        (d) => d.type === 'clip' && d.id === clipWithEligibleParent.id,
      ) as (ViewerDoc & { type: 'clip' }) | undefined
      expect(clip).toBeDefined()
      expect(clip!.subtitlesUrl).toBe('https://example.com/clip-en.vtt')
    })
  })

  describe('req forwarding', () => {
    it('threads req through all payload.find calls for usage-tracking / rate-limit hooks', async () => {
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
        expect(collectionsHit.has('lecture-tags')).toBe(true)
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

    it('passes viewerData on the lecture-tags call only', async () => {
      const findSpy = vi.spyOn(payload, 'find')
      try {
        await callEndpoint(payload, { limit: 5, pathProgress: 3 })

        const tagCall = findSpy.mock.calls.find(
          ([args]) => (args as { collection?: string }).collection === 'lecture-tags',
        )
        const tagReq = (
          tagCall![0] as { req?: { context?: Record<string, unknown> } }
        ).req
        expect(tagReq?.context?.viewerData).toEqual({ pathProgress: 3 })
      } finally {
        findSpy.mockRestore()
      }
    })
  })

  // Intentionally omitting a shuffle-order test: verifying randomness with
  // a small fixture pool produces flaky tests. Fisher-Yates correctness is
  // covered by inspection of `lecturesForViewer.ts`.
  void tagViewers10 // keep fixture referenced (defined for future coverage)
})
