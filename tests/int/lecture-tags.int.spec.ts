import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { LectureTag } from '@/payload-types'
import { generateRulesJsonSchema } from '@/fields/rulesField'

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

describe('LectureTags Collection', () => {
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

  describe('createLectureTag factory', () => {
    it('creates a lecture tag with default test data', async () => {
      const tag = await testData.createLectureTag(payload)
      expect(tag.id).toBeDefined()
      expect(tag.label).toMatch(/^Test Lecture Tag /)
    })

    it('creates a lecture tag with custom overrides', async () => {
      const tag = await testData.createLectureTag(payload, {
        label: 'Custom Tag Label',
      })
      expect(tag.label).toBe('Custom Tag Label')
    })
  })

  describe('label field', () => {
    it('requires a label', async () => {
      await expect(
        payload.create({
          collection: 'lecture-tags',
          data: {} as Record<string, unknown>,
        }),
      ).rejects.toThrow()
    })

    it('persists and retrieves label', async () => {
      const tag = await testData.createLectureTag(payload, { label: 'Beginner Lectures' })
      const fetched = await payload.findByID({
        collection: 'lecture-tags',
        id: tag.id,
      })
      expect(fetched.label).toBe('Beginner Lectures')
    })

    it('updates the label', async () => {
      const tag = await testData.createLectureTag(payload, { label: 'Original' })
      const updated = await payload.update({
        collection: 'lecture-tags',
        id: tag.id,
        data: { label: 'Updated' },
      })
      expect(updated.label).toBe('Updated')
    })

    it('deletes a lecture tag', async () => {
      const tag = await testData.createLectureTag(payload)
      await payload.delete({ collection: 'lecture-tags', id: tag.id })
      await expect(
        payload.findByID({ collection: 'lecture-tags', id: tag.id }),
      ).rejects.toThrow()
    })
  })

  describe('rules field', () => {
    it('accepts valid range rules with AND logic', async () => {
      const rules = {
        logic: 'AND' as const,
        pathProgress: { min: 1, max: 10 },
        totalMeditationsViewed: { min: 5 },
      }
      const tag = await testData.createLectureTag(payload, { rules })
      const fetched = await payload.findByID({ collection: 'lecture-tags', id: tag.id })
      expect(fetched.rules).toEqual(rules)
    })

    it('accepts null rules (show to all users)', async () => {
      const tag = await testData.createLectureTag(payload, { rules: null })
      const fetched = await payload.findByID({ collection: 'lecture-tags', id: tag.id })
      expect(fetched.rules).toBeNull()
    })

    it('accepts empty object rules', async () => {
      const tag = await testData.createLectureTag(payload, { rules: {} })
      const fetched = await payload.findByID({ collection: 'lecture-tags', id: tag.id })
      expect(fetched.rules).toEqual({})
    })

    it('accepts a single range rule', async () => {
      const rules = { pathProgress: { min: 3, max: 7 } }
      const tag = await testData.createLectureTag(payload, { rules })
      expect(tag.rules).toEqual(rules)
    })

    it('accepts all three range rules', async () => {
      const rules = {
        logic: 'OR' as const,
        pathProgress: { min: 0, max: 5 },
        totalMeditationsViewed: { min: 10, max: 50 },
        totalLecturesViewed: { min: 1, max: 20 },
      }
      const tag = await testData.createLectureTag(payload, { rules })
      expect(tag.rules).toEqual(rules)
    })

    it('rejects range rules where max <= min', async () => {
      const rules = {
        pathProgress: { min: 10, max: 5 },
      }
      await expect(
        testData.createLectureTag(payload, { rules }),
      ).rejects.toThrow()
    })

    it('defines JSON schema with additionalProperties: false for client-side validation', () => {
      const schema = generateRulesJsonSchema([
        { name: 'pathProgress', type: 'range' },
        { name: 'totalMeditationsViewed', type: 'range' },
        { name: 'totalLecturesViewed', type: 'range' },
      ])
      expect(schema.additionalProperties).toBe(false)
      expect(schema.properties).toHaveProperty('pathProgress')
      expect(schema.properties).toHaveProperty('totalMeditationsViewed')
      expect(schema.properties).toHaveProperty('totalLecturesViewed')
      expect(schema.properties).toHaveProperty('logic')
    })
  })

  describe('bidirectional join with lectures', () => {
    it('shows lectures on tag when lectures reference it', async () => {
      const tag = await testData.createLectureTag(payload, { label: 'Join Test Tag' })

      // Create a lecture with this tag
      const lecture = await testData.createLecture(payload, undefined, {
        tags: [tag.id],
      })

      // Fetch the tag with depth to populate the join
      const fetchedTag = await payload.findByID({
        collection: 'lecture-tags',
        id: tag.id,
        depth: 1,
      })

      const lectures = fetchedTag.lectures as { docs: Array<{ id: number }> }
      expect(lectures.docs).toHaveLength(1)
      const lectureId = typeof lectures.docs[0] === 'number' ? lectures.docs[0] : lectures.docs[0].id
      expect(lectureId).toBe(lecture.id)
    })

    it('returns empty lectures array for tag with no lectures', async () => {
      const tag = await testData.createLectureTag(payload, { label: 'Empty Tag' })

      const fetchedTag = await payload.findByID({
        collection: 'lecture-tags',
        id: tag.id,
        depth: 1,
      })

      const lectures = fetchedTag.lectures as { docs: Array<{ id: number }> }
      expect(lectures.docs).toHaveLength(0)
    })

    it('reflects changes when lecture tags are updated', async () => {
      const tag1 = await testData.createLectureTag(payload, { label: 'Tag A' })
      const tag2 = await testData.createLectureTag(payload, { label: 'Tag B' })

      // Create lecture with tag1
      const lecture = await testData.createLecture(payload, undefined, {
        tags: [tag1.id],
      })

      // Update lecture to use tag2 instead
      await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { tags: [tag2.id] },
      })

      // tag1 should have no lectures
      const fetchedTag1 = await payload.findByID({
        collection: 'lecture-tags',
        id: tag1.id,
        depth: 1,
      })
      const tag1Lectures = fetchedTag1.lectures as { docs: Array<{ id: number }> }
      expect(tag1Lectures.docs).toHaveLength(0)

      // tag2 should have the lecture
      const fetchedTag2 = await payload.findByID({
        collection: 'lecture-tags',
        id: tag2.id,
        depth: 1,
      })
      const tag2Lectures = fetchedTag2.lectures as { docs: Array<{ id: number }> }
      expect(tag2Lectures.docs).toHaveLength(1)
    })
  })
})
