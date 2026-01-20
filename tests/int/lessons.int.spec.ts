import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { File, Meditation } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Lessons Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testPanelMedia1: File
  let testPanelMedia2: File
  let testMeditation: Meditation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testNarrator: any

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test resources - use files for panel media
    testPanelMedia1 = await testData.createFile(payload, {}, 'image-1050x700.jpg')
    testPanelMedia2 = await testData.createFile(payload, {}, 'image-1050x700.webp')

    // Create narrator for meditation
    testNarrator = await testData.createNarrator(payload, { name: 'Test Narrator' })

    // Create meditation for lesson relationships
    // Note: Lessons collection filters meditations by type='lesson'
    testMeditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
      },
      {
        title: 'Test Meditation for Lessons',
        type: 'lesson',
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
            title: 'Welcome',
            text: 'Learn the basics of breathing meditation',
          },
          {
            title: 'Introduction',
            text: 'Learn the basics of breathing meditation',
            media: testPanelMedia1.id,
          },
        ],
      })

      expect(lesson).toBeDefined()
      expect(lesson.title).toBe('Introduction to Breathing')
      expect(lesson.meditation).toBe(testMeditation.id)
      expect(lesson.panels).toHaveLength(2)
      expect(lesson.panels[0].title).toBe('Welcome')
      expect(lesson.panels[0].text).toBe('Learn the basics of breathing meditation')
      expect(lesson.panels[1].title).toBe('Introduction')
      expect(lesson.panels[1].text).toBe('Learn the basics of breathing meditation')
      expect(lesson.panels[1].media).toBe(testPanelMedia1.id)
    })

    it('creates a lesson with media panels', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Media Lesson',
        meditation: testMeditation.id,
        panels: [
          {
            title: 'Media Lesson',
            text: 'Welcome to our media lesson',
          },
          {
            media: testPanelMedia1.id,
          },
        ],
      })

      expect(lesson.panels).toHaveLength(2)
      expect(lesson.panels[0].title).toBe('Media Lesson')
      expect(lesson.panels[1].media).toBe(testPanelMedia1.id)
    })

    it('creates a lesson with multiple panels', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Multi-Panel Lesson',
        meditation: testMeditation.id,
        panels: [
          {
            title: 'Multi-Panel Lesson',
            text: 'Welcome to our multi-panel lesson',
          },
          {
            title: 'Panel 2',
            text: 'Second panel text',
            media: testPanelMedia2.id,
          },
        ],
      })

      expect(lesson.panels).toHaveLength(2)
      expect(lesson.panels[0].title).toBe('Multi-Panel Lesson')
      expect(lesson.panels[1].title).toBe('Panel 2')
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
            title: 'Content Lesson',
            text: 'Welcome to our content lesson',
          },
          {
            title: 'Content',
            text: 'Lesson content',
            media: testPanelMedia1.id,
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
            title: 'Original Title',
            text: 'Welcome to the lesson',
          },
          {
            title: 'Panel',
            text: 'Text',
            media: testPanelMedia1.id,
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
            title: 'Panel Update Test',
            text: 'Welcome to the lesson',
          },
          {
            title: 'Original',
            text: 'Original text',
            media: testPanelMedia1.id,
          },
        ],
      })

      const updated = await payload.update({
        collection: 'lessons',
        id: lesson.id,
        data: {
          panels: [
            {
              title: 'Updated Cover',
              text: 'Updated welcome message',
            },
            {
              title: 'Updated',
              text: 'Updated text',
              media: testPanelMedia2.id,
            },
          ],
        },
      })

      expect(updated.panels).toHaveLength(2)
      expect(updated.panels[0].title).toBe('Updated Cover')
      expect(updated.panels[1].title).toBe('Updated')
      expect(updated.panels[1].text).toBe('Updated text')
    })
  })

  describe('Lesson Deletion', () => {
    it('soft deletes a lesson', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'To Be Deleted',
        meditation: testMeditation.id,
        panels: [
          {
            title: 'To Be Deleted',
            text: 'Welcome to the lesson',
          },
          {
            title: 'Delete me',
            text: 'This will be deleted',
            media: testPanelMedia1.id,
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
    // TODO: Enable this test when versioning is enabled in Lessons collection
    // Currently, versions: { drafts: true } is commented out in Lessons.ts
    it.skip('creates draft versions', async () => {
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

  describe('Subtitle Validation (JSON Schema)', () => {
    it('accepts valid subtitle data with all required fields', async () => {
      const validSubtitles = {
        captions: [
          {
            duration: 0,
            content: 'Welcome to the first lesson',
            startTime: '00:00:00.300',
          },
          {
            duration: 2,
            content: 'This is the second caption',
            startTime: '00:00:02.500',
          },
        ],
      }

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle Validation Test',
        meditation: testMeditation.id,
        introSubtitles: validSubtitles,
      })

      expect(lesson.introSubtitles).toEqual(validSubtitles)
    })

    it('accepts subtitle data with optional startOfParagraph as null', async () => {
      const subtitlesWithNull = {
        captions: [
          {
            duration: 0,
            content: 'Caption with null startOfParagraph',
            startOfParagraph: null,
            startTime: '00:00:00.300',
          },
        ],
      }

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle with null',
        meditation: testMeditation.id,
        introSubtitles: subtitlesWithNull,
      })

      expect(lesson.introSubtitles).toEqual(subtitlesWithNull)
    })

    it('accepts subtitle data with optional startOfParagraph as boolean', async () => {
      const subtitlesWithBoolean = {
        captions: [
          {
            duration: 0,
            content: 'First paragraph',
            startOfParagraph: true,
            startTime: '00:00:00.300',
          },
          {
            duration: 2,
            content: 'Continuing same paragraph',
            startOfParagraph: false,
            startTime: '00:00:02.500',
          },
        ],
      }

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle with boolean',
        meditation: testMeditation.id,
        introSubtitles: subtitlesWithBoolean,
      })

      expect(lesson.introSubtitles).toEqual(subtitlesWithBoolean)
    })

    it('accepts subtitle data without optional startOfParagraph field', async () => {
      const subtitlesWithoutOptional = {
        captions: [
          {
            duration: 0,
            content: 'Caption without startOfParagraph',
            startTime: '00:00:00.300',
          },
        ],
      }

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle without optional field',
        meditation: testMeditation.id,
        introSubtitles: subtitlesWithoutOptional,
      })

      expect(lesson.introSubtitles).toEqual(subtitlesWithoutOptional)
    })
  })
})
