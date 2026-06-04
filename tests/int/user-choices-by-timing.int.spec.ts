import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Meditation, UserChoice } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Tests for the per-timing meditation assignment model on UserChoices.
 *
 * Each tag has a `timings` select field and 4 localized relationship fields
 * (morningMeditation, afternoonMeditation, eveningMeditation, nightMeditation).
 * The standard API replaces the old custom endpoint.
 */
describe('UserChoices per-timing assignments', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // Test fixtures
  let morningTag: UserChoice
  let eveningTag: UserChoice
  let parentTag: UserChoice
  // Test meditations
  let dailyMorning: Meditation
  let dailyEvening: Meditation
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

    // Create published daily meditations
    dailyMorning = await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        label: 'Morning Meditation',
        type: 'daily',
        _status: 'published',
      },
    )

    dailyEvening = await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        label: 'Evening Meditation',
        type: 'daily',
        _status: 'published',
      },
    )

    // Czech locale meditation
    czechMorning = await testData.createMeditation(
      payload,
      { narrator: sharedNarrator, thumbnail: sharedThumbnail },
      {
        label: 'Czech Morning Meditation',
        type: 'daily',
        _status: 'published',
        locale: 'cs',
      },
    )

    // Create tags with timings and assignments
    morningTag = await testData.createUserChoice(payload, {
      title: 'Morning Focus',
      order: 1,
      timings: ['morning', 'afternoon'],
    })

    // Assign morning meditation (EN)
    morningTag = await payload.update({
      collection: 'user-choices',
      id: morningTag.id,
      locale: 'en',
      data: { morningMeditation: dailyMorning.id },
    })

    // Assign Czech morning meditation (title required for localized update)
    await payload.update({
      collection: 'user-choices',
      id: morningTag.id,
      locale: 'cs',
      data: { title: 'Ranní Soustředění', morningMeditation: czechMorning.id },
    })

    eveningTag = await testData.createUserChoice(payload, {
      title: 'Evening Calm',
      order: 2,
      timings: ['evening', 'night'],
    })

    // Assign evening meditation (EN)
    eveningTag = await payload.update({
      collection: 'user-choices',
      id: eveningTag.id,
      locale: 'en',
      data: { eveningMeditation: dailyEvening.id },
    })

    await testData.createUserChoice(payload, {
      title: 'Unused Tag',
      order: 3,
    })

    // Create parent tag (should be excluded from results)
    parentTag = await testData.createUserChoice(payload, {
      title: 'Parent Category',
    })
    await testData.createUserChoice(payload, {
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
        collection: 'user-choices',
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
        collection: 'user-choices',
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
        collection: 'user-choices',
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
        collection: 'user-choices',
        id: morningTag.id,
        locale: 'en',
        depth: 1,
      })

      const meditation = result.morningMeditation as Meditation | null
      expect(meditation).toBeDefined()
      expect(meditation!.id).toBe(dailyMorning.id)
      expect(meditation!.label).toBe('Morning Meditation')
    })

    it('returns Czech meditation for Czech locale', async () => {
      const result = await payload.findByID({
        collection: 'user-choices',
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
        collection: 'user-choices',
        locale: 'cs',
        where: {
          morningMeditation: { exists: true },
          isParent: { not_equals: true },
        },
      })

      const csTitles = csResult.docs.map((t) => t.title)
      expect(csTitles).toContain('Ranní Soustředění')
    })
  })

  describe('parent tag exclusion', () => {
    it('excludes parent tags from filtered results', async () => {
      const result = await payload.find({
        collection: 'user-choices',
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
        collection: 'user-choices',
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
      const tag = await testData.createUserChoice(payload, {
        title: 'Admin Timings Test',
      })

      const updated = await payload.update({
        collection: 'user-choices',
        id: tag.id,
        data: { timings: ['morning', 'night'] },
      })

      expect(updated.timings).toEqual(expect.arrayContaining(['morning', 'night']))
    })
  })

  describe('empty results', () => {
    it('returns no tags for timing with no assignments', async () => {
      // No tags have nightMeditation assigned
      const result = await payload.find({
        collection: 'user-choices',
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
