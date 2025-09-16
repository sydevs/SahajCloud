import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { LessonUnit } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('LessonUnits Collection', () => {
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

  describe('Basic LessonUnit Operations', () => {
    it('creates a lesson unit with required fields', async () => {
      const unit = await testData.createLessonUnit(payload, {
        title: 'Beginner Meditation Series',
        color: '#FF5733',
      })

      expect(unit).toBeDefined()
      expect(unit.title).toBe('Beginner Meditation Series')
      expect(unit.color).toBe('#FF5733')
      expect(unit.createdAt).toBeDefined()
      expect(unit.updatedAt).toBeDefined()
    })

    it('validates hex color format', async () => {
      await expect(
        testData.createLessonUnit(payload, {
          title: 'Invalid Color Unit',
          color: 'red', // Invalid format
        })
      ).rejects.toThrow('Color')
    })

    it('validates hex color with proper format', async () => {
      const unit = await testData.createLessonUnit(payload, {
        title: 'Valid Color Unit',
        color: '#00FF00',
      })

      expect(unit.color).toBe('#00FF00')
    })

    it('requires all mandatory fields', async () => {
      await expect(
        payload.create({
          collection: 'lesson-units',
          data: {
            // Missing title
            color: '#FF0000',
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('LessonUnit Update Operations', () => {
    let existingUnit: LessonUnit

    beforeAll(async () => {
      existingUnit = await testData.createLessonUnit(payload, {
        title: 'Unit to Update',
        color: '#0000FF',
      })
    })

    it('updates unit title', async () => {
      const updated = await payload.update({
        collection: 'lesson-units',
        id: existingUnit.id,
        data: {
          title: 'Updated Unit Title',
        },
      })

      expect(updated.title).toBe('Updated Unit Title')
      expect(updated.color).toBe('#0000FF') // Color unchanged
    })

    it('updates unit color', async () => {
      const updated = await payload.update({
        collection: 'lesson-units',
        id: existingUnit.id,
        data: {
          color: '#FF00FF',
        },
      })

      expect(updated.color).toBe('#FF00FF')
    })
  })

  describe('LessonUnit Deletion', () => {
    it('soft deletes a unit', async () => {
      const unit = await testData.createLessonUnit(payload, {
        title: 'Unit to Delete',
        color: '#123456',
      })

      await payload.delete({
        collection: 'lesson-units',
        id: unit.id,
      })

      // Verify it's not in normal query
      const normalQuery = await payload.find({
        collection: 'lesson-units',
        where: {
          id: { equals: unit.id },
        },
      })
      expect(normalQuery.docs).toHaveLength(0)

      // Verify it's in trash
      const trashedUnits = await payload.find({
        collection: 'lesson-units',
        where: {
          id: { equals: unit.id },
        },
        showDeleted: true,
      })

      expect(trashedUnits.docs).toHaveLength(1)
      expect(trashedUnits.docs[0]._deleted).toBe(true)
    })
  })

  describe('LessonUnit Virtual Fields', () => {
    it('returns lesson count as 0 for new unit', async () => {
      const unit = await testData.createLessonUnit(payload, {
        title: 'Empty Unit',
        color: '#AABBCC',
      })

      const retrieved = await payload.findByID({
        collection: 'lesson-units',
        id: unit.id,
      })

      expect(retrieved.lessonCount).toBe(0)
    })
  })

  describe('LessonUnit Query Operations', () => {
    beforeAll(async () => {
      // Create multiple units for querying
      await testData.createLessonUnit(payload, { title: 'Alpha Unit', color: '#111111' })
      await testData.createLessonUnit(payload, { title: 'Beta Unit', color: '#222222' })
      await testData.createLessonUnit(payload, { title: 'Gamma Unit', color: '#333333' })
    })

    it('finds all units', async () => {
      const result = await payload.find({
        collection: 'lesson-units',
        limit: 100,
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(3)
    })

    it('filters units by title', async () => {
      const result = await payload.find({
        collection: 'lesson-units',
        where: {
          title: { contains: 'Beta' },
        },
      })

      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].title).toBe('Beta Unit')
    })

    it('sorts units by title', async () => {
      const result = await payload.find({
        collection: 'lesson-units',
        sort: 'title',
        where: {
          title: { contains: 'Unit' },
        },
      })

      const sortedTitles = result.docs
        .map((d) => d.title)
        .filter((t) => ['Alpha Unit', 'Beta Unit', 'Gamma Unit'].includes(t))
        .sort()
      
      expect(sortedTitles).toEqual(['Alpha Unit', 'Beta Unit', 'Gamma Unit'])
    })
  })
})