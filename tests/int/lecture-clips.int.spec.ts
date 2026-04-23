import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client so creating parent Lectures in tests does
// not hit the network. Same setup as lectures.int.spec.ts — kept in sync.
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

describe('Lecture Clips Collection', () => {
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

  describe('Required fields', () => {
    it('rejects creation without a parent lecture', async () => {
      await expect(
        payload.create({
          collection: 'lecture-clips',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { title: 'Missing parent', startTime: 0, endTime: 60 } as any,
        }),
      ).rejects.toThrow()
    })

    it('rejects creation without a title', async () => {
      const parent = await testData.createLecture(payload)
      await expect(
        payload.create({
          collection: 'lecture-clips',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { lecture: parent.id, startTime: 0, endTime: 60 } as any,
        }),
      ).rejects.toThrow()
    })
  })

  describe('startTime / endTime validation', () => {
    it('stores valid times as seconds', async () => {
      const clip = await testData.createLectureClip(payload, undefined, {
        startTime: 930,
        endTime: 3765,
      })

      expect(clip.startTime).toBe(930)
      expect(clip.endTime).toBe(3765)
    })

    it('rejects endTime <= startTime', async () => {
      await expect(
        testData.createLectureClip(payload, undefined, { startTime: 100, endTime: 50 }),
      ).rejects.toThrow()
      await expect(
        testData.createLectureClip(payload, undefined, { startTime: 100, endTime: 100 }),
      ).rejects.toThrow()
    })

    it('rejects negative startTime / endTime', async () => {
      await expect(
        testData.createLectureClip(payload, undefined, { startTime: -10, endTime: 60 }),
      ).rejects.toThrow()
      await expect(
        testData.createLectureClip(payload, undefined, { startTime: 0, endTime: -5 }),
      ).rejects.toThrow()
    })
  })

  describe('Parent relationship & clips join', () => {
    it('appears in the parent Lecture.clips join after creation', async () => {
      const parent = await testData.createLecture(payload)
      const clip = await testData.createLectureClip(payload, { lecture: parent.id })

      const refreshed = await payload.findByID({
        collection: 'lectures',
        id: parent.id,
        depth: 0,
      })

      const clipIds = ((refreshed.clips?.docs ?? []) as Array<number | { id: number }>).map(
        (doc) => (typeof doc === 'number' ? doc : doc.id),
      )
      expect(clipIds).toContain(clip.id)
    })
  })

  describe('Localized fields', () => {
    it('round-trips localized title per locale', async () => {
      const clip = await testData.createLectureClip(payload, undefined, {
        title: 'English title',
      })

      await payload.update({
        collection: 'lecture-clips',
        id: clip.id,
        locale: 'cs',
        data: { title: 'Czech title' },
      })

      const en = await payload.findByID({
        collection: 'lecture-clips',
        id: clip.id,
        locale: 'en',
        fallbackLocale: false,
      })
      const cs = await payload.findByID({
        collection: 'lecture-clips',
        id: clip.id,
        locale: 'cs',
        fallbackLocale: false,
      })
      expect(en.title).toBe('English title')
      expect(cs.title).toBe('Czech title')
    })

    it('persists the subtitles array non-localized (same value across locales)', async () => {
      // Subtitles are per-locale ROWS in a non-localized array — overriding
      // parent metadata on a per-locale basis, not per-request-locale.
      const clip = await testData.createLectureClip(payload, undefined, {
        subtitles: [
          { locale: 'en', url: 'https://example.com/clip-en.vtt' },
          { locale: 'cs', url: 'https://example.com/clip-cs.vtt' },
        ],
      })

      const en = await payload.findByID({
        collection: 'lecture-clips',
        id: clip.id,
        locale: 'en',
        fallbackLocale: false,
      })
      const cs = await payload.findByID({
        collection: 'lecture-clips',
        id: clip.id,
        locale: 'cs',
        fallbackLocale: false,
      })
      expect(en.subtitles?.map((r) => ({ locale: r.locale, url: r.url }))).toEqual([
        { locale: 'en', url: 'https://example.com/clip-en.vtt' },
        { locale: 'cs', url: 'https://example.com/clip-cs.vtt' },
      ])
      expect(cs.subtitles?.map((r) => ({ locale: r.locale, url: r.url }))).toEqual([
        { locale: 'en', url: 'https://example.com/clip-en.vtt' },
        { locale: 'cs', url: 'https://example.com/clip-cs.vtt' },
      ])
    })
  })

  describe('Admin visibility', () => {
    it('is hidden from the sidebar (admin.hidden === true)', () => {
      const collection = payload.collections['lecture-clips']?.config
      expect(collection?.admin?.hidden).toBe(true)
    })
  })

  describe('Optional tags', () => {
    it('creates successfully without any tags', async () => {
      const clip = await testData.createLectureClip(payload)

      expect(clip.id).toBeDefined()
      // hasMany relationship with no values — Payload returns [] not undefined
      expect(clip.tags ?? []).toEqual([])
    })
  })

  describe('Parent deletion cascade', () => {
    it('deletes child clips when the parent lecture is deleted', async () => {
      const parent = await testData.createLecture(payload)
      const clipA = await testData.createLectureClip(payload, { lecture: parent.id })
      const clipB = await testData.createLectureClip(payload, { lecture: parent.id })

      await payload.delete({ collection: 'lectures', id: parent.id })

      const remaining = await payload.find({
        collection: 'lecture-clips',
        where: { id: { in: [clipA.id, clipB.id] } },
        depth: 0,
      })
      expect(remaining.docs).toHaveLength(0)
    })

    it('does not touch clips belonging to other parents', async () => {
      // Serialized: createLecture auto-creates a thumbnail Image, and parallel
      // creates collide on the images.filename unique index.
      const parentA = await testData.createLecture(payload)
      const parentB = await testData.createLecture(payload)
      const clipA = await testData.createLectureClip(payload, { lecture: parentA.id })
      const clipB = await testData.createLectureClip(payload, { lecture: parentB.id })

      await payload.delete({ collection: 'lectures', id: parentA.id })

      const survivor = await payload.findByID({
        collection: 'lecture-clips',
        id: clipB.id,
        depth: 0,
      })
      expect(survivor.id).toBe(clipB.id)

      await expect(
        payload.findByID({ collection: 'lecture-clips', id: clipA.id, depth: 0 }),
      ).rejects.toThrow()
    })
  })
})
