import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Lesson, LessonUnit, Media, Meditation, Page } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Lessons Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testUnit: LessonUnit
  let testThumbnail: Media
  let testPanelImage1: Media
  let testPanelImage2: Media
  let testMeditation: Meditation
  let testArticle: Page
  let testNarrator: any

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test resources
    testUnit = await testData.createLessonUnit(payload, {
      title: 'Test Unit for Lessons',
      color: '#FF0000',
    })

    testThumbnail = await testData.createMediaImage(payload, { alt: 'Lesson thumbnail' })
    testPanelImage1 = await testData.createMediaImage(payload, { alt: 'Panel image 1' })
    testPanelImage2 = await testData.createMediaImage(payload, { alt: 'Panel image 2' })
    
    // Create narrator for meditation
    testNarrator = await testData.createNarrator(payload, { name: 'Test Narrator' })
    
    testMeditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testThumbnail.id,
      },
      {
        title: 'Test Meditation',
        locale: 'en',
      }
    )
    
    testArticle = await testData.createPage(payload, {
      title: 'Deep Dive Article',
      category: 'knowledge',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Basic Lesson Operations', () => {
    it('creates a lesson with all required fields', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Introduction to Breathing',
        thumbnail: testThumbnail.id,
        color: '#00FF00',
        unit: testUnit.id,
        order: 0,
        panels: [
          {
            title: 'Welcome',
            text: 'Learn the basics of breathing meditation',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson).toBeDefined()
      expect(lesson.title).toBe('Introduction to Breathing')
      expect(lesson.color).toBe('#00FF00')
      expect(lesson.unit).toBe(testUnit.id)
      expect(lesson.order).toBe(0)
      expect(lesson.panels).toHaveLength(1)
      expect(lesson.panels[0].title).toBe('Welcome')
    })

    it('creates a lesson with optional relationships', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Advanced Breathing',
        thumbnail: testThumbnail.id,
        color: '#0000FF',
        unit: testUnit.id,
        order: 1,
        meditation: testMeditation.id,
        article: testArticle.id,
        panels: [
          {
            title: 'Step 1',
            text: 'First step description',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson.meditation).toBe(testMeditation.id)
      expect(lesson.article).toBe(testArticle.id)
    })

    it('validates color format', async () => {
      await expect(
        testData.createLesson(payload, {
          title: 'Invalid Color Lesson',
          thumbnail: testThumbnail.id,
          color: 'blue', // Invalid format
          unit: testUnit.id,
          order: 2,
          panels: [
            {
              title: 'Panel',
              text: 'Text',
              image: testPanelImage1.id,
            },
          ],
        })
      ).rejects.toThrow('Color')
    })

    it('requires at least one panel', async () => {
      await expect(
        payload.create({
          collection: 'lessons',
          data: {
            title: 'No Panels Lesson',
            thumbnail: testThumbnail.id,
            color: '#FF0000',
            unit: testUnit.id,
            order: 3,
            panels: [], // Empty panels array
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('Lesson Order Validation', () => {
    let unit1: LessonUnit
    let unit2: LessonUnit

    beforeAll(async () => {
      unit1 = await testData.createLessonUnit(payload, {
        title: 'Unit 1',
        color: '#111111',
      })
      unit2 = await testData.createLessonUnit(payload, {
        title: 'Unit 2',
        color: '#222222',
      })
    })

    it('allows same order in different units', async () => {
      const lesson1 = await testData.createLesson(payload, {
        title: 'Unit 1 - Lesson 1',
        thumbnail: testThumbnail.id,
        color: '#333333',
        unit: unit1.id,
        order: 0,
        panels: [
          {
            title: 'Panel',
            text: 'Text',
            image: testPanelImage1.id,
          },
        ],
      })

      const lesson2 = await testData.createLesson(payload, {
        title: 'Unit 2 - Lesson 1',
        thumbnail: testThumbnail.id,
        color: '#444444',
        unit: unit2.id,
        order: 0, // Same order as lesson1 but different unit
        panels: [
          {
            title: 'Panel',
            text: 'Text',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson1.order).toBe(0)
      expect(lesson2.order).toBe(0)
    })

    it('prevents duplicate order within same unit', async () => {
      await testData.createLesson(payload, {
        title: 'First Lesson',
        thumbnail: testThumbnail.id,
        color: '#555555',
        unit: unit1.id,
        order: 10,
        panels: [
          {
            title: 'Panel',
            text: 'Text',
            image: testPanelImage1.id,
          },
        ],
      })

      await expect(
        testData.createLesson(payload, {
          title: 'Duplicate Order Lesson',
          thumbnail: testThumbnail.id,
          color: '#666666',
          unit: unit1.id,
          order: 10, // Duplicate order in same unit
          panels: [
            {
              title: 'Panel',
              text: 'Text',
              image: testPanelImage1.id,
            },
          ],
        })
      ).rejects.toThrow('Another lesson in this unit already has order 10')
    })
  })

  describe('Lesson Panels', () => {
    it('creates lesson with multiple panels', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Multi-Panel Lesson',
        thumbnail: testThumbnail.id,
        color: '#777777',
        unit: testUnit.id,
        order: 20,
        panels: [
          {
            title: 'Introduction',
            text: 'Welcome to the lesson',
            image: testPanelImage1.id,
          },
          {
            title: 'Main Content',
            text: 'The core teaching',
            image: testPanelImage2.id,
          },
          {
            title: 'Conclusion',
            text: 'Wrapping up',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson.panels).toHaveLength(3)
      expect(lesson.panels[0].title).toBe('Introduction')
      expect(lesson.panels[1].title).toBe('Main Content')
      expect(lesson.panels[2].title).toBe('Conclusion')
    })

    it('validates panel required fields', async () => {
      await expect(
        payload.create({
          collection: 'lessons',
          data: {
            title: 'Invalid Panel Lesson',
            thumbnail: testThumbnail.id,
            color: '#888888',
            unit: testUnit.id,
            order: 21,
            panels: [
              {
                title: 'Panel Title',
                // Missing text and image
              },
            ],
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('Lesson Publishing', () => {
    it('creates lesson with publish date', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      const lesson = await testData.createLesson(payload, {
        title: 'Scheduled Lesson',
        thumbnail: testThumbnail.id,
        color: '#999999',
        unit: testUnit.id,
        order: 30,
        publishAt: futureDate.toISOString(),
        panels: [
          {
            title: 'Panel',
            text: 'Text',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson.publishAt).toBeDefined()
      const publishDate = new Date(lesson.publishAt)
      expect(publishDate.getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('Lesson Update Operations', () => {
    let existingLesson: Lesson

    beforeAll(async () => {
      existingLesson = await testData.createLesson(payload, {
        title: 'Lesson to Update',
        thumbnail: testThumbnail.id,
        color: '#AAAAAA',
        unit: testUnit.id,
        order: 40,
        panels: [
          {
            title: 'Original Panel',
            text: 'Original Text',
            image: testPanelImage1.id,
          },
        ],
      })
    })

    it('updates lesson title and color', async () => {
      const updated = await payload.update({
        collection: 'lessons',
        id: existingLesson.id,
        data: {
          title: 'Updated Lesson Title',
          color: '#BBBBBB',
        },
      })

      expect(updated.title).toBe('Updated Lesson Title')
      expect(updated.color).toBe('#BBBBBB')
    })

    it('updates lesson panels', async () => {
      const updated = await payload.update({
        collection: 'lessons',
        id: existingLesson.id,
        data: {
          panels: [
            {
              title: 'New Panel 1',
              text: 'New Text 1',
              image: testPanelImage2.id,
            },
            {
              title: 'New Panel 2',
              text: 'New Text 2',
              image: testPanelImage1.id,
            },
          ],
        },
      })

      expect(updated.panels).toHaveLength(2)
      expect(updated.panels[0].title).toBe('New Panel 1')
      expect(updated.panels[1].title).toBe('New Panel 2')
    })
  })

  describe('Lesson Deletion', () => {
    it('soft deletes a lesson', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Lesson to Delete',
        thumbnail: testThumbnail.id,
        color: '#CCCCCC',
        unit: testUnit.id,
        order: 50,
        panels: [
          {
            title: 'Panel',
            text: 'Text',
            image: testPanelImage1.id,
          },
        ],
      })

      await payload.delete({
        collection: 'lessons',
        id: lesson.id,
      })

      // Verify it's marked as deleted by checking deletedAt field
      const deletedLesson = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 0,
        overrideAccess: false,
        showHiddenFields: false,
      }).catch(() => null)
      
      // The lesson should not be accessible through normal queries due to soft delete
      expect(deletedLesson).toBeNull()
    })
  })

  describe('Lesson Query Operations', () => {
    let queryUnit: LessonUnit

    beforeAll(async () => {
      queryUnit = await testData.createLessonUnit(payload, {
        title: 'Query Test Unit',
        color: '#DDDDDD',
      })

      // Create lessons for querying
      await testData.createLesson(payload, {
        title: 'Alpha Lesson',
        thumbnail: testThumbnail.id,
        color: '#111111',
        unit: queryUnit.id,
        order: 0,
        panels: [{ title: 'P', text: 'T', image: testPanelImage1.id }],
      })
      
      await testData.createLesson(payload, {
        title: 'Beta Lesson',
        thumbnail: testThumbnail.id,
        color: '#222222',
        unit: queryUnit.id,
        order: 1,
        panels: [{ title: 'P', text: 'T', image: testPanelImage1.id }],
      })
      
      await testData.createLesson(payload, {
        title: 'Gamma Lesson',
        thumbnail: testThumbnail.id,
        color: '#333333',
        unit: queryUnit.id,
        order: 2,
        panels: [{ title: 'P', text: 'T', image: testPanelImage1.id }],
      })
    })

    it('finds lessons by unit', async () => {
      const result = await payload.find({
        collection: 'lessons',
        where: {
          unit: { equals: queryUnit.id },
        },
      })

      expect(result.docs).toHaveLength(3)
    })

    it('sorts lessons by order', async () => {
      const result = await payload.find({
        collection: 'lessons',
        where: {
          unit: { equals: queryUnit.id },
        },
        sort: 'order',
      })

      expect(result.docs[0].title).toBe('Alpha Lesson')
      expect(result.docs[1].title).toBe('Beta Lesson')
      expect(result.docs[2].title).toBe('Gamma Lesson')
    })
  })
})