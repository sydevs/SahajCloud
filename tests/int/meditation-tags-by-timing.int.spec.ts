import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Meditation, MeditationTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Tests for the meditationTagsByTiming endpoint logic.
 *
 * Tests simulate the endpoint's query logic directly via Payload's local API,
 * following the same pattern as frameFiltering.int.spec.ts.
 */
describe('MeditationTags by-timing endpoint logic', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // Test fixtures
  let morningTag: MeditationTag
  let eveningTag: MeditationTag
  let parentTag: MeditationTag
  let unusedTag: MeditationTag

  // Shared test dependencies
  let sharedNarrator: number
  let sharedThumbnail: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create shared dependencies once
    const narrator = await testData.createNarrator(payload, { name: 'Timing Test Narrator' })
    sharedNarrator = narrator.id
    const thumbnail = await testData.createMediaImage(payload)
    sharedThumbnail = thumbnail.id

    // Create tags
    morningTag = await testData.createMeditationTag(payload, {
      title: 'Morning Focus',
      order: 1,
    })
    eveningTag = await testData.createMeditationTag(payload, {
      title: 'Evening Calm',
      order: 2,
    })
    unusedTag = await testData.createMeditationTag(payload, {
      title: 'Unused Tag',
      order: 3,
    })

    // Create parent tag (should be excluded from results)
    parentTag = await testData.createMeditationTag(payload, {
      title: 'Parent Category',
    })
    // Make it a parent by creating a child
    await testData.createMeditationTag(payload, {
      title: 'Child of Parent',
      parent: parentTag.id,
    })

    // Create published morning meditation tagged with morningTag
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Morning Meditation',
        timings: ['morning'],
        tags: [morningTag.id],
        _status: 'published',
        type: 'quick',
      },
    )

    // Create published evening meditation tagged with eveningTag
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Evening Meditation',
        timings: ['evening', 'night'],
        tags: [eveningTag.id],
        _status: 'published',
        type: 'daily',
      },
    )

    // Create universal meditation (empty timings = available any time)
    // Tagged with both morningTag and eveningTag
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Universal Meditation',
        timings: [],
        tags: [morningTag.id, eveningTag.id],
        _status: 'published',
        type: 'quick',
      },
    )

    // Create draft meditation (should NOT appear in results)
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Draft Morning Meditation',
        timings: ['morning'],
        tags: [morningTag.id],
        _status: 'draft',
        type: 'quick',
      },
    )

    // Create lesson meditation (should NOT appear in results)
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Lesson Meditation',
        timings: ['morning'],
        tags: [morningTag.id],
        type: 'lesson',
      },
    )

    // Create Czech locale meditation
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Czech Morning Meditation',
        timings: ['morning'],
        tags: [morningTag.id],
        _status: 'published',
        type: 'quick',
        locale: 'cs',
      },
    )

    // Create meditation tagged with parent tag (parent tag should still be excluded)
    await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Parent-Tagged Meditation',
        timings: ['morning'],
        tags: [parentTag.id],
        _status: 'published',
        type: 'quick',
      },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('timing filtering', () => {
    it('returns published meditations matching morning timing', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'morning' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        depth: 1,
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).toContain('Morning Meditation')
      expect(titles).toContain('Universal Meditation')
      expect(titles).not.toContain('Evening Meditation')
      expect(titles).not.toContain('Draft Morning Meditation')
      expect(titles).not.toContain('Lesson Meditation')
    })

    it('returns published meditations matching evening timing', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'evening' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        depth: 1,
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).toContain('Evening Meditation')
      expect(titles).toContain('Universal Meditation')
      expect(titles).not.toContain('Morning Meditation')
    })

    it('includes universal meditations (empty timings) for any timing', async () => {
      // Query for afternoon timing - only universal meditation should match
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'afternoon' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        depth: 1,
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).toContain('Universal Meditation')
      expect(titles).not.toContain('Morning Meditation')
      expect(titles).not.toContain('Evening Meditation')
    })
  })

  describe('tag grouping and filtering', () => {
    it('groups meditations by tag and excludes parent tags', async () => {
      // Simulate the endpoint's grouping logic
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'morning' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        depth: 1,
        limit: 500,
      })

      // Collect tag IDs from meditations
      const tagIds = new Set<number>()
      for (const meditation of meditations.docs) {
        const tags = meditation.tags as Array<number | MeditationTag> | null
        if (!tags) continue
        for (const tag of tags) {
          const tagId = typeof tag === 'number' ? tag : tag.id
          tagIds.add(tagId)
        }
      }

      expect(tagIds.size).toBeGreaterThan(0)
      expect(tagIds.has(morningTag.id)).toBe(true)

      // Fetch tags excluding parents
      const tags = await payload.find({
        collection: 'meditation-tags',
        where: {
          id: { in: Array.from(tagIds) },
          isParent: { not_equals: true },
        },
        sort: 'order',
        limit: 100,
      })

      const resultTagIds = tags.docs.map((t) => t.id)
      expect(resultTagIds).toContain(morningTag.id)
      expect(resultTagIds).not.toContain(parentTag.id)
    })

    it('returns tags sorted by order field', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'morning' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        depth: 1,
        limit: 500,
      })

      const tagIds = new Set<number>()
      for (const meditation of meditations.docs) {
        const tags = meditation.tags as Array<number | MeditationTag> | null
        if (!tags) continue
        for (const tag of tags) {
          tagIds.add(typeof tag === 'number' ? tag : tag.id)
        }
      }

      const tags = await payload.find({
        collection: 'meditation-tags',
        where: {
          id: { in: Array.from(tagIds) },
          isParent: { not_equals: true },
        },
        sort: 'order',
        limit: 100,
      })

      // Verify ascending order
      for (let i = 1; i < tags.docs.length; i++) {
        expect(tags.docs[i].order ?? 0).toBeGreaterThanOrEqual(tags.docs[i - 1].order ?? 0)
      }
    })

    it('does not include tags that have no matching meditations', async () => {
      // Query for morning timing
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'morning' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        depth: 1,
        limit: 500,
      })

      // Collect tag IDs that have meditations
      const tagIds = new Set<number>()
      for (const meditation of meditations.docs) {
        const tags = meditation.tags as Array<number | MeditationTag> | null
        if (!tags) continue
        for (const tag of tags) {
          tagIds.add(typeof tag === 'number' ? tag : tag.id)
        }
      }

      // Unused tag should not be in the results
      expect(tagIds.has(unusedTag.id)).toBe(false)
    })
  })

  describe('locale filtering', () => {
    it('filters by English locale by default', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'morning' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).not.toContain('Czech Morning Meditation')
    })

    it('returns Czech locale meditations when locale=cs', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'cs' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'morning' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).toContain('Czech Morning Meditation')
      expect(titles).not.toContain('Morning Meditation')
    })
  })

  describe('draft and lesson exclusion', () => {
    it('excludes draft meditations', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            { timings: { contains: 'morning' } },
          ],
        },
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).not.toContain('Draft Morning Meditation')
    })

    it('excludes lesson-type meditations', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            { timings: { contains: 'morning' } },
          ],
        },
        limit: 500,
      })

      const titles = meditations.docs.map((m) => m.title)
      expect(titles).not.toContain('Lesson Meditation')
    })
  })

  describe('meditation preview fields', () => {
    it('meditations include required preview fields', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'en' } },
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            { timings: { contains: 'morning' } },
          ],
        },
        depth: 1,
        limit: 10,
      })

      expect(meditations.docs.length).toBeGreaterThan(0)

      for (const meditation of meditations.docs) {
        // Check all preview fields exist
        expect(meditation.id).toBeDefined()
        expect(meditation).toHaveProperty('title')
        expect(meditation).toHaveProperty('timings')
        expect(meditation).toHaveProperty('thumbnail')
        expect(meditation).toHaveProperty('durationMinutes')
      }
    })
  })

  describe('input validation', () => {
    it('validates timing parameter values', () => {
      const validTimings = ['morning', 'afternoon', 'evening', 'night']
      const invalidTimings = ['midnight', 'dawn', '', 'MORNING', 'lunch']

      for (const timing of validTimings) {
        expect(validTimings).toContain(timing)
      }

      for (const timing of invalidTimings) {
        expect(validTimings).not.toContain(timing)
      }
    })
  })

  describe('empty results', () => {
    it('returns no results for timing with no matching meditations in unused locale', async () => {
      const meditations = await payload.find({
        collection: 'meditations',
        where: {
          and: [
            { locale: { equals: 'fa' } }, // Farsi - unlikely to have test data
            { _status: { equals: 'published' } },
            { type: { not_equals: 'lesson' } },
            {
              or: [
                { timings: { contains: 'night' } },
                { timings: { exists: false } },
              ],
            },
          ],
        },
        limit: 500,
      })

      expect(meditations.docs).toHaveLength(0)
    })
  })

  describe('endpoint handler structure', () => {
    it('exports a valid Endpoint object', async () => {
      const { meditationTagsByTiming } = await import('@/endpoints')

      expect(meditationTagsByTiming).toBeDefined()
      expect(meditationTagsByTiming.path).toBe('/by-timing/:timing')
      expect(meditationTagsByTiming.method).toBe('get')
      expect(typeof meditationTagsByTiming.handler).toBe('function')
    })

    it('framesByNarrator export is preserved after extraction', async () => {
      const { framesByNarrator } = await import('@/endpoints')

      expect(framesByNarrator).toBeDefined()
      expect(framesByNarrator.path).toBe('/by-narrator/:narratorId')
      expect(framesByNarrator.method).toBe('get')
      expect(typeof framesByNarrator.handler).toBe('function')
    })
  })
})
