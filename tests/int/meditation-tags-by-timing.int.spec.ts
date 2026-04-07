import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Meditation, MeditationTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Tests for the per-timing meditation assignment model on MeditationTags.
 *
 * Each tag has a `timings` select field and 4 localized relationship fields
 * (morningMeditation, afternoonMeditation, eveningMeditation, nightMeditation).
 * The standard API replaces the old custom endpoint.
 */
describe('MeditationTags per-timing assignments', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // Test fixtures
  let morningTag: MeditationTag
  let eveningTag: MeditationTag
  let parentTag: MeditationTag
  // Test meditations
  let quickMorning: Meditation
  let quickEvening: Meditation
  let czechMorning: Meditation

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

    // Create published quick meditations
    quickMorning = await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Morning Quick Meditation',
        type: 'quick',
        _status: 'published',
      },
    )

    quickEvening = await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Evening Quick Meditation',
        type: 'quick',
        _status: 'published',
      },
    )

    // Czech locale meditation
    czechMorning = await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        title: 'Czech Morning Meditation',
        type: 'quick',
        _status: 'published',
        locale: 'cs',
      },
    )

    // Create tags with timings and assignments
    morningTag = await testData.createMeditationTag(payload, {
      title: 'Morning Focus',
      order: 1,
      timings: ['morning', 'afternoon'],
    })

    // Assign morning meditation (EN)
    morningTag = await payload.update({
      collection: 'meditation-tags',
      id: morningTag.id,
      locale: 'en',
      data: { morningMeditation: quickMorning.id },
    })

    // Assign Czech morning meditation
    await payload.update({
      collection: 'meditation-tags',
      id: morningTag.id,
      locale: 'cs',
      data: { morningMeditation: czechMorning.id },
    })

    eveningTag = await testData.createMeditationTag(payload, {
      title: 'Evening Calm',
      order: 2,
      timings: ['evening', 'night'],
    })

    // Assign evening meditation (EN)
    eveningTag = await payload.update({
      collection: 'meditation-tags',
      id: eveningTag.id,
      locale: 'en',
      data: { eveningMeditation: quickEvening.id },
    })

    await testData.createMeditationTag(payload, {
      title: 'Unused Tag',
      order: 3,
    })

    // Create parent tag (should be excluded from results)
    parentTag = await testData.createMeditationTag(payload, {
      title: 'Parent Category',
    })
    await testData.createMeditationTag(payload, {
      title: 'Child of Parent',
      parent: parentTag.id,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('standard API filtering by timing', () => {
    it('returns tags with morning meditation assignments', async () => {
      const result = await payload.find({
        collection: 'meditation-tags',
        locale: 'en',
        where: {
          morningMeditation: { exists: true },
          isParent: { not_equals: true },
        },
        sort: 'order',
        depth: 1,
      })

      expect(result.docs.length).toBeGreaterThan(0)
      const tagTitles = result.docs.map((t) => t.title)
      expect(tagTitles).toContain('Morning Focus')
      expect(tagTitles).not.toContain('Evening Calm')
      expect(tagTitles).not.toContain('Unused Tag')
    })

    it('returns tags with evening meditation assignments', async () => {
      const result = await payload.find({
        collection: 'meditation-tags',
        locale: 'en',
        where: {
          eveningMeditation: { exists: true },
          isParent: { not_equals: true },
        },
        sort: 'order',
        depth: 1,
      })

      const tagTitles = result.docs.map((t) => t.title)
      expect(tagTitles).toContain('Evening Calm')
      expect(tagTitles).not.toContain('Morning Focus')
    })

    it('returns tags sorted by order', async () => {
      const result = await payload.find({
        collection: 'meditation-tags',
        where: {
          morningMeditation: { exists: true },
          isParent: { not_equals: true },
        },
        sort: 'order',
      })

      for (let i = 1; i < result.docs.length; i++) {
        expect(result.docs[i].order ?? 0).toBeGreaterThanOrEqual(result.docs[i - 1].order ?? 0)
      }
    })
  })

  describe('locale-specific assignments', () => {
    it('returns English meditation for English locale', async () => {
      const result = await payload.findByID({
        collection: 'meditation-tags',
        id: morningTag.id,
        locale: 'en',
        depth: 1,
      })

      const meditation = result.morningMeditation as Meditation | null
      expect(meditation).toBeDefined()
      expect(meditation!.id).toBe(quickMorning.id)
      expect(meditation!.title).toBe('Morning Quick Meditation')
    })

    it('returns Czech meditation for Czech locale', async () => {
      const result = await payload.findByID({
        collection: 'meditation-tags',
        id: morningTag.id,
        locale: 'cs',
        depth: 1,
      })

      const meditation = result.morningMeditation as Meditation | null
      expect(meditation).toBeDefined()
      expect(meditation!.id).toBe(czechMorning.id)
    })

    it('filters by locale when querying with exists', async () => {
      // Czech locale should have morningMeditation on morningTag
      const csResult = await payload.find({
        collection: 'meditation-tags',
        locale: 'cs',
        where: {
          morningMeditation: { exists: true },
          isParent: { not_equals: true },
        },
      })

      const csTitles = csResult.docs.map((t) => t.title)
      expect(csTitles).toContain('Morning Focus')
    })
  })

  describe('parent tag exclusion', () => {
    it('excludes parent tags from filtered results', async () => {
      const result = await payload.find({
        collection: 'meditation-tags',
        where: {
          isParent: { not_equals: true },
        },
      })

      const ids = result.docs.map((t) => t.id)
      expect(ids).not.toContain(parentTag.id)
    })
  })

  describe('populated meditation at depth=1', () => {
    it('populates the meditation document', async () => {
      const result = await payload.find({
        collection: 'meditation-tags',
        locale: 'en',
        where: {
          morningMeditation: { exists: true },
          isParent: { not_equals: true },
        },
        depth: 1,
        limit: 10,
      })

      expect(result.docs.length).toBeGreaterThan(0)

      for (const tag of result.docs) {
        if (tag.morningMeditation) {
          const meditation = tag.morningMeditation as Meditation
          expect(meditation.id).toBeDefined()
          expect(meditation).toHaveProperty('title')
          expect(meditation).toHaveProperty('durationMinutes')
        }
      }
    })
  })

  describe('timings field access control', () => {
    it('admin managers can update timings', async () => {
      const tag = await testData.createMeditationTag(payload, {
        title: 'Admin Timings Test',
      })

      const updated = await payload.update({
        collection: 'meditation-tags',
        id: tag.id,
        data: { timings: ['morning', 'night'] },
      })

      expect(updated.timings).toEqual(expect.arrayContaining(['morning', 'night']))
    })
  })

  describe('reverse join fields on Meditations', () => {
    it('shows tag assignment via join field', async () => {
      const meditation = await payload.findByID({
        collection: 'meditations',
        id: quickMorning.id,
        locale: 'en',
        depth: 0,
      })

      // The join field asMorningMeditation should contain the morningTag
      const asMorning = meditation.asMorningMeditation as {
        docs: (number | { id: number })[]
      } | null
      expect(asMorning).toBeDefined()
      expect(asMorning!.docs.length).toBeGreaterThan(0)

      const tagIds = asMorning!.docs.map((t) => (typeof t === 'number' ? t : t.id))
      expect(tagIds).toContain(morningTag.id)
    })
  })

  describe('empty results', () => {
    it('returns no tags for timing with no assignments', async () => {
      // No tags have nightMeditation assigned
      const result = await payload.find({
        collection: 'meditation-tags',
        locale: 'en',
        where: {
          nightMeditation: { exists: true },
          isParent: { not_equals: true },
        },
      })

      expect(result.docs).toHaveLength(0)
    })
  })
})
