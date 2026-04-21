import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { ViewerRule } from '@/payload-types'
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

describe('ViewerRules Collection', () => {
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

  describe('createViewerRule factory', () => {
    it('creates a viewer rule with default test data', async () => {
      const rule = await testData.createViewerRule(payload)
      expect(rule.id).toBeDefined()
      expect(rule.label).toMatch(/^Test Viewer Rule /)
    })

    it('creates a viewer rule with custom overrides', async () => {
      const rule = await testData.createViewerRule(payload, {
        label: 'Custom Rule Label',
      })
      expect(rule.label).toBe('Custom Rule Label')
    })
  })

  describe('label field', () => {
    it('requires a label', async () => {
      await expect(
        payload.create({
          collection: 'viewer-rules',
          data: {} as Record<string, unknown>,
        }),
      ).rejects.toThrow()
    })

    it('persists and retrieves label', async () => {
      const rule = await testData.createViewerRule(payload, { label: 'Beginner Audience' })
      const fetched = await payload.findByID({
        collection: 'viewer-rules',
        id: rule.id,
      })
      expect(fetched.label).toBe('Beginner Audience')
    })

    it('updates the label', async () => {
      const rule = await testData.createViewerRule(payload, { label: 'Original' })
      const updated = await payload.update({
        collection: 'viewer-rules',
        id: rule.id,
        data: { label: 'Updated' },
      })
      expect(updated.label).toBe('Updated')
    })

    it('deletes a viewer rule', async () => {
      const rule = await testData.createViewerRule(payload)
      await payload.delete({ collection: 'viewer-rules', id: rule.id })
      await expect(
        payload.findByID({ collection: 'viewer-rules', id: rule.id }),
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
      const rule = await testData.createViewerRule(payload, { rules })
      const fetched = await payload.findByID({ collection: 'viewer-rules', id: rule.id })
      expect(fetched.rules).toEqual(rules)
    })

    it('accepts null rules (always-match audience)', async () => {
      const rule = await testData.createViewerRule(payload, { rules: null })
      const fetched = await payload.findByID({ collection: 'viewer-rules', id: rule.id })
      expect(fetched.rules).toBeNull()
    })

    it('accepts empty object rules', async () => {
      const rule = await testData.createViewerRule(payload, { rules: {} })
      const fetched = await payload.findByID({ collection: 'viewer-rules', id: rule.id })
      expect(fetched.rules).toEqual({})
    })

    it('accepts a single range rule', async () => {
      const rules = { pathProgress: { min: 3, max: 7 } }
      const rule = await testData.createViewerRule(payload, { rules })
      expect(rule.rules).toEqual(rules)
    })

    it('accepts all four range rules', async () => {
      const rules = {
        logic: 'OR' as const,
        pathProgress: { min: 0, max: 5 },
        meditationsPerWeek: { min: 1, max: 7 },
        totalMeditationsViewed: { min: 10, max: 50 },
        totalLecturesViewed: { min: 1, max: 20 },
      }
      const rule = await testData.createViewerRule(payload, { rules })
      expect(rule.rules).toEqual(rules)
    })

    it('rejects range rules where max <= min', async () => {
      const rules = {
        pathProgress: { min: 10, max: 5 },
      }
      await expect(
        testData.createViewerRule(payload, { rules }),
      ).rejects.toThrow()
    })

    it('defines JSON schema with additionalProperties: false for client-side validation', () => {
      const schema = generateRulesJsonSchema([
        { name: 'pathProgress', type: 'range' },
        { name: 'meditationsPerWeek', type: 'range' },
        { name: 'totalMeditationsViewed', type: 'range' },
        { name: 'totalLecturesViewed', type: 'range' },
      ])
      expect(schema.additionalProperties).toBe(false)
      expect(schema.properties).toHaveProperty('pathProgress')
      expect(schema.properties).toHaveProperty('meditationsPerWeek')
      expect(schema.properties).toHaveProperty('totalMeditationsViewed')
      expect(schema.properties).toHaveProperty('totalLecturesViewed')
      expect(schema.properties).toHaveProperty('logic')
    })
  })

  describe('bidirectional joins', () => {
    it('shows lectures on rule when lectures reference it via audience', async () => {
      const rule = await testData.createViewerRule(payload, { label: 'Lecture Join Test' })

      const lecture = await testData.createLecture(payload, undefined, {
        audience: rule.id,
      })

      const fetchedRule = await payload.findByID({
        collection: 'viewer-rules',
        id: rule.id,
        depth: 1,
      })

      const lectures = fetchedRule.lectures as { docs: Array<{ id: number }> }
      expect(lectures.docs).toHaveLength(1)
      expect(lectures.docs[0].id).toBe(lecture.id)
    })

    it('returns empty arrays for a rule with no referencing items', async () => {
      const rule = await testData.createViewerRule(payload, { label: 'Empty Rule' })

      const fetchedRule = await payload.findByID({
        collection: 'viewer-rules',
        id: rule.id,
        depth: 1,
      })

      const lectures = fetchedRule.lectures as { docs: unknown[] }
      const lectureClips = fetchedRule.lectureClips as { docs: unknown[] }
      const appCards = fetchedRule.appCards as { docs: unknown[] }
      expect(lectures.docs).toHaveLength(0)
      expect(lectureClips.docs).toHaveLength(0)
      expect(appCards.docs).toHaveLength(0)
    })

    it('reflects changes when lecture audience is reassigned', async () => {
      const rule1 = await testData.createViewerRule(payload, { label: 'Rule A' })
      const rule2 = await testData.createViewerRule(payload, { label: 'Rule B' })

      const lecture = await testData.createLecture(payload, undefined, {
        audience: rule1.id,
      })

      await payload.update({
        collection: 'lectures',
        id: lecture.id,
        data: { audience: rule2.id },
      })

      const fetched1 = await payload.findByID({
        collection: 'viewer-rules',
        id: rule1.id,
        depth: 1,
      })
      const docs1 = (fetched1.lectures as { docs: unknown[] }).docs
      expect(docs1).toHaveLength(0)

      const fetched2 = await payload.findByID({
        collection: 'viewer-rules',
        id: rule2.id,
        depth: 1,
      })
      const docs2 = (fetched2.lectures as { docs: unknown[] }).docs
      expect(docs2).toHaveLength(1)
    })

    it('includes app cards in the appCards join', async () => {
      const rule = await testData.createViewerRule(payload, { label: 'AppCard Join Test' })
      const card = await testData.createAppCard(payload, {
        title: 'Card With Audience',
        audience: rule.id,
      })

      const fetchedRule = await payload.findByID({
        collection: 'viewer-rules',
        id: rule.id,
        depth: 1,
      })

      const appCards = fetchedRule.appCards as { docs: Array<{ id: number }> }
      expect(appCards.docs).toHaveLength(1)
      expect(appCards.docs[0].id).toBe(card.id)
    })
  })
})
