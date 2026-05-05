import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — prevents real network calls when creating lectures
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'))
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

describe('Audiences Collection', () => {
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

  describe('createAudience factory', () => {
    it('creates an audience with default test data', async () => {
      const audience = await testData.createAudience(payload)
      expect(audience.id).toBeDefined()
      expect(audience.label).toMatch(/^Test Audience /)
    })

    it('creates an audience with custom overrides', async () => {
      const audience = await testData.createAudience(payload, {
        label: 'Custom Audience Label',
      })
      expect(audience.label).toBe('Custom Audience Label')
    })
  })

  describe('label field', () => {
    it('requires a label', async () => {
      await expect(
        payload.create({
          collection: 'audiences',
          data: {} as Record<string, unknown>,
        }),
      ).rejects.toThrow()
    })

    it('persists and retrieves label', async () => {
      const audience = await testData.createAudience(payload, { label: 'Beginner Audience' })
      const fetched = await payload.findByID({
        collection: 'audiences',
        id: audience.id,
      })
      expect(fetched.label).toBe('Beginner Audience')
    })

    it('updates the label', async () => {
      const audience = await testData.createAudience(payload, { label: 'Original' })
      const updated = await payload.update({
        collection: 'audiences',
        id: audience.id,
        data: { label: 'Updated' },
      })
      expect(updated.label).toBe('Updated')
    })

    it('deletes an audience', async () => {
      const audience = await testData.createAudience(payload)
      await payload.delete({ collection: 'audiences', id: audience.id })
      await expect(
        payload.findByID({ collection: 'audiences', id: audience.id }),
      ).rejects.toThrow()
    })
  })

  describe('type field', () => {
    it('defaults to progress type', async () => {
      const audience = await testData.createAudience(payload, { label: 'Default Type Test' })
      expect(audience.type).toBe('progress')
    })

    it('accepts context type', async () => {
      const audience = await testData.createAudience(payload, {
        label: 'Context Type Test',
        type: 'context',
      })
      expect(audience.type).toBe('context')
    })
  })

  describe('progress range fields', () => {
    it('accepts valid range rules with min and max', async () => {
      const audience = await testData.createAudience(payload, {
        label: 'Progress Range Test',
        pathProgress: { min: 1, max: 10 },
        totalMeditationsViewed: { min: 5 },
      })
      const fetched = await payload.findByID({ collection: 'audiences', id: audience.id })
      expect((fetched.pathProgress as { min?: number; max?: number })?.min).toBe(1)
      expect((fetched.pathProgress as { min?: number; max?: number })?.max).toBe(10)
    })

    it('rejects range where max <= min (custom validator)', async () => {
      await expect(
        payload.create({
          collection: 'audiences',
          data: {
            label: 'Invalid Range',
            type: 'progress',
            pathProgress: { min: 10, max: 5 },
          },
        }),
      ).rejects.toThrow()
    })
  })

  describe('bidirectional joins', () => {
    it('shows lectures on audience when lectures reference it via audiences', async () => {
      const audience = await testData.createAudience(payload, { label: 'Lecture Join Test' })

      const lecture = await testData.createLecture(payload, undefined, {
        audiences: [audience.id],
      })

      const fetchedAudience = await payload.findByID({
        collection: 'audiences',
        id: audience.id,
        depth: 1,
      })

      const lectures = fetchedAudience.lectures as { docs: Array<{ id: number }> }
      expect(lectures.docs).toHaveLength(1)
      expect(lectures.docs[0].id).toBe(lecture.id)
    })

    it('returns empty arrays for an audience with no referencing items', async () => {
      const audience = await testData.createAudience(payload, { label: 'Empty Audience' })

      const fetchedAudience = await payload.findByID({
        collection: 'audiences',
        id: audience.id,
        depth: 1,
      })

      const lectures = fetchedAudience.lectures as { docs: unknown[] }
      const appCards = fetchedAudience.appCards as { docs: unknown[] }
      expect(lectures.docs).toHaveLength(0)
      expect(appCards.docs).toHaveLength(0)
    })

    it('reflects changes when lecture audiences are reassigned', async () => {
      const audienceA = await testData.createAudience(payload, { label: 'Audience A' })
      const audienceB = await testData.createAudience(payload, { label: 'Audience B' })

      const lecture = await testData.createLecture(payload, undefined, {
        audiences: [audienceA.id],
      })

      await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { audiences: [audienceB.id] },
      })

      const fetchedA = await payload.findByID({
        collection: 'audiences',
        id: audienceA.id,
        depth: 1,
      })
      const docsA = (fetchedA.lectures as { docs: unknown[] }).docs
      expect(docsA).toHaveLength(0)

      const fetchedB = await payload.findByID({
        collection: 'audiences',
        id: audienceB.id,
        depth: 1,
      })
      const docsB = (fetchedB.lectures as { docs: unknown[] }).docs
      expect(docsB).toHaveLength(1)
    })

    it('shows the same lecture under multiple audiences when assigned to several', async () => {
      const audienceA = await testData.createAudience(payload, { label: 'Multi A' })
      const audienceB = await testData.createAudience(payload, { label: 'Multi B' })

      const lecture = await testData.createLecture(payload, undefined, {
        audiences: [audienceA.id, audienceB.id],
      })

      const fetchedA = await payload.findByID({
        collection: 'audiences',
        id: audienceA.id,
        depth: 1,
      })
      const fetchedB = await payload.findByID({
        collection: 'audiences',
        id: audienceB.id,
        depth: 1,
      })

      const docsA = (fetchedA.lectures as { docs: Array<{ id: number }> }).docs
      const docsB = (fetchedB.lectures as { docs: Array<{ id: number }> }).docs
      expect(docsA.map((d) => d.id)).toContain(lecture.id)
      expect(docsB.map((d) => d.id)).toContain(lecture.id)
    })

    it('includes app cards in the appCards join', async () => {
      const audience = await testData.createAudience(payload, { label: 'AppCard Join Test' })
      const card = await testData.createAppCard(payload, {
        title: 'Card With Audience',
        audiences: [audience.id],
      })

      const fetchedAudience = await payload.findByID({
        collection: 'audiences',
        id: audience.id,
        depth: 1,
      })

      const appCards = fetchedAudience.appCards as { docs: Array<{ id: number }> }
      expect(appCards.docs).toHaveLength(1)
      expect(appCards.docs[0].id).toBe(card.id)
    })
  })
})

