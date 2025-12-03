import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Image, Meditation } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Lessons Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testPanelImage1: Image
  let testPanelImage2: Image
  let testMeditation: Meditation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testNarrator: any

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test resources
    testPanelImage1 = await testData.createMediaImage(payload, { alt: 'Panel image 1' })
    testPanelImage2 = await testData.createMediaImage(payload, { alt: 'Panel image 2' })

    // Create narrator for meditation
    testNarrator = await testData.createNarrator(payload, { name: 'Test Narrator' })

    // Create meditation for lesson relationships
    testMeditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
      },
      {
        title: 'Test Meditation for Lessons',
      },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Basic Lesson Operations', () => {
    it('creates a lesson with all required fields', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Introduction to Breathing',
        meditation: testMeditation.id,
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Welcome',
            quote: 'Learn the basics of breathing meditation',
          },
          {
            blockType: 'text' as const,
            title: 'Introduction',
            text: 'Learn the basics of breathing meditation',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson).toBeDefined()
      expect(lesson.title).toBe('Introduction to Breathing')
      expect(lesson.meditation).toBe(testMeditation.id)
      expect(lesson.panels).toHaveLength(2)
      expect(lesson.panels[0].blockType).toBe('cover')
      // Type narrowing for block types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coverPanel = lesson.panels[0] as any
      expect(coverPanel.title).toBe('Welcome')
      expect(coverPanel.quote).toBe('Learn the basics of breathing meditation')
      expect(lesson.panels[1].blockType).toBe('text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textPanel = lesson.panels[1] as any
      expect(textPanel.title).toBe('Introduction')
      expect(textPanel.text).toBe('Learn the basics of breathing meditation')
    })

    it('creates a lesson with video panels', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Video Lesson',
        meditation: testMeditation.id,
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Video Lesson',
            quote: 'Welcome to our video lesson',
          },
          {
            blockType: 'video' as const,
            video: null, // Would be a FileAttachment ID
          },
        ],
      })

      expect(lesson.panels).toHaveLength(2)
      expect(lesson.panels[0].blockType).toBe('cover')
      expect(lesson.panels[1].blockType).toBe('video')
    })

    it('creates a lesson with multiple panels', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Multi-Panel Lesson',
        meditation: testMeditation.id,
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Multi-Panel Lesson',
            quote: 'Welcome to our multi-panel lesson',
          },
          {
            blockType: 'text' as const,
            title: 'Panel 2',
            text: 'Second panel text',
            image: testPanelImage2.id,
          },
        ],
      })

      expect(lesson.panels).toHaveLength(2)
      // Type narrowing for block types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const panel1 = lesson.panels[0] as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const panel2 = lesson.panels[1] as any
      expect(panel1.title).toBe('Multi-Panel Lesson')
      expect(panel2.title).toBe('Panel 2')
    })

    it('creates a lesson with content field', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Content Lesson',
        meditation: testMeditation.id,
        article: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [
                  {
                    type: 'text',
                    version: 1,
                    text: 'Deep dive content',
                  },
                ],
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            version: 1,
          },
        },
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Content Lesson',
            quote: 'Welcome to our content lesson',
          },
          {
            blockType: 'text' as const,
            title: 'Content',
            text: 'Lesson content',
            image: testPanelImage1.id,
          },
        ],
      })

      expect(lesson.article).toBeDefined()
      expect(lesson.meditation).toBe(testMeditation.id)
    })

    it('validates required fields', async () => {
      await expect(
        payload.create({
          collection: 'lessons',
          data: {
            // Missing required title and meditation
            panels: [],
            // Intentionally invalid data for validation test
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        }),
      ).rejects.toThrow()
    })

    it('requires at least one panel', async () => {
      await expect(
        payload.create({
          collection: 'lessons',
          data: {
            title: 'No Panels',
            unit: 'Unit 1',
            step: 1,
            meditation: testMeditation.id,
            panels: [], // Empty panels array
            // Intentionally invalid data for validation test
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        }),
      ).rejects.toThrow()
    })
  })

  describe('Lesson Update Operations', () => {
    it('updates lesson title', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Original Title',
        meditation: testMeditation.id,
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Original Title',
            quote: 'Welcome to the lesson',
          },
          {
            blockType: 'text' as const,
            title: 'Panel',
            text: 'Text',
            image: testPanelImage1.id,
          },
        ],
      })

      const updated = await payload.update({
        collection: 'lessons',
        id: lesson.id,
        data: {
          title: 'Updated Title',
        },
      })

      expect(updated.title).toBe('Updated Title')
    })

    it('updates lesson panels', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Panel Update Test',
        meditation: testMeditation.id,
        panels: [
          {
            blockType: 'cover' as const,
            title: 'Panel Update Test',
            quote: 'Welcome to the lesson',
          },
          {
            blockType: 'text' as const,
            title: 'Original',
            text: 'Original text',
            image: testPanelImage1.id,
          },
        ],
      })

      const updated = await payload.update({
        collection: 'lessons',
        id: lesson.id,
        data: {
          panels: [
            {
              blockType: 'cover' as const,
              title: 'Updated Cover',
              quote: 'Updated welcome message',
            },
            {
              blockType: 'text' as const,
              title: 'Updated',
              text: 'Updated text',
              image: testPanelImage2.id,
            },
          ],
        },
      })

      expect(updated.panels).toHaveLength(2)
      // Type narrowing for block types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coverPanel = updated.panels[0] as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textPanel = updated.panels[1] as any
      expect(coverPanel.title).toBe('Updated Cover')
      expect(textPanel.title).toBe('Updated')
      expect(textPanel.text).toBe('Updated text')
    })
  })

  describe('Lesson Deletion', () => {
    it('soft deletes a lesson', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'To Be Deleted',
        meditation: testMeditation.id,
        panels: [
          {
            blockType: 'cover' as const,
            title: 'To Be Deleted',
            quote: 'Welcome to the lesson',
          },
          {
            blockType: 'text' as const,
            title: 'Delete me',
            text: 'This will be deleted',
            image: testPanelImage1.id,
          },
        ],
      })

      await payload.delete({
        collection: 'lessons',
        id: lesson.id,
      })

      // Should not find the deleted lesson in regular queries
      const result = await payload.find({
        collection: 'lessons',
        where: { id: { equals: lesson.id } },
      })

      expect(result.docs).toHaveLength(0)
    })
  })

  describe('Lesson Query Operations', () => {
    it('finds all lessons', async () => {
      // Create a few test lessons
      await testData.createLesson(payload, {
        title: 'Query Test 1',
        meditation: testMeditation.id,
      })
      await testData.createLesson(payload, {
        title: 'Query Test 2',
        meditation: testMeditation.id,
      })

      const result = await payload.find({
        collection: 'lessons',
        limit: 100,
      })

      expect(result.docs).toBeDefined()
      expect(result.docs.length).toBeGreaterThan(0)
    })

    it('filters lessons by title', async () => {
      const uniqueTitle = `Unique ${Date.now()}`
      await testData.createLesson(payload, {
        title: uniqueTitle,
        meditation: testMeditation.id,
      })

      const result = await payload.find({
        collection: 'lessons',
        where: {
          title: { equals: uniqueTitle },
        },
      })

      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].title).toBe(uniqueTitle)
    })

    it('finds lessons with relationships', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Relationship Test',
        meditation: testMeditation.id,
      })

      const result = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 1,
      })

      expect(result.meditation).toBeDefined()
      if (typeof result.meditation === 'object' && result.meditation !== null) {
        expect(result.meditation.id).toBe(testMeditation.id)
      }
    })
  })

  describe('Lesson Versioning', () => {
    it('creates draft versions', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Draft Test',
        meditation: testMeditation.id,
      })

      const draft = await payload.update({
        collection: 'lessons',
        id: lesson.id,
        data: {
          title: 'Draft Title',
        },
        draft: true,
      })

      expect(draft._status).toBe('draft')
    })
  })

  // NOTE: These tests are temporarily disabled as they test the old permission array system
  // which has been replaced by role-based access control. The translator role doesn't have
  // lessons access in the new system (only path-editor does). These tests should be
  // reimplemented to test valid RBAC scenarios (e.g., path-editor updating lessons).
  describe.skip('Field-Level Access Control (DISABLED - Old Permission System)', () => {
    // Tests commented out - need to be reimplemented for RBAC system
  })
})
