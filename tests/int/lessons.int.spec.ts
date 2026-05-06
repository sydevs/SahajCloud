/**
 * Lessons collection custom-behavior tests.
 *
 * Basic CRUD and required-field validation are covered by collections-smoke;
 * this file holds tests for behavior that's project-specific.
 *
 * Currently: subtitle JSON behavior (documents that Payload's `jsonSchema`
 * is a Monaco editor hint, not API-enforced validation) and article rich-text
 * cleanup for stale Lexical relationship nodes.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Lesson, Meditation } from '@/payload-types'

import { createLexicalWithRelationshipNode } from '../utils/lexicalTestHelpers'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Lessons Collection — custom behavior', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testMeditation: Meditation

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const narrator = await testData.createNarrator(payload, { name: 'Test Narrator' })
    testMeditation = await testData.createMeditation(
      payload,
      { narrator: narrator.id },
      { title: 'Test Meditation for Lessons', type: 'lesson' },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('introSubtitles JSON behavior', () => {
    it('stores subtitle data with required fields', async () => {
      const validSubtitles = {
        captions: [
          { duration: 0, content: 'First caption', startTime: '00:00:00.300' },
          { duration: 2, content: 'Second caption', startTime: '00:00:02.500' },
        ],
      }

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle Storage Test',
        meditation: testMeditation.id,
        introSubtitles: validSubtitles,
      })

      expect(lesson.introSubtitles).toEqual(validSubtitles)
    })

    it('accepts subtitle data with extra fields not in jsonSchema', async () => {
      // Documents intentional behavior: jsonSchema only guides the Monaco
      // editor; the API stores whatever shape the client sends. The Storyblok
      // importer relies on this when migrating legacy `startOfParagraph`.
      const subtitlesWithLegacyField = {
        captions: [
          {
            duration: 0,
            content: 'Caption with legacy field',
            startOfParagraph: null,
            startTime: '00:00:00.300',
          },
        ],
      }

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle Legacy Field Test',
        meditation: testMeditation.id,
        introSubtitles: subtitlesWithLegacyField,
      })

      expect(lesson.introSubtitles).toEqual(subtitlesWithLegacyField)
    })
  })

  describe('article rich text', () => {
    it('strips stale relationship nodes for removed collections before rendering the editor', async () => {
      const staleArticle = createLexicalWithRelationshipNode({
        relationTo: 'lecture-clips',
        value: 123,
      }) as Lesson['article']

      const lesson = await testData.createLesson(payload, {
        title: 'Lesson with stale article relationship',
        meditation: testMeditation.id,
        article: staleArticle,
      })

      const fetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 0,
      })

      const articleRoot = fetched.article?.root as { children: unknown[] }
      expect(articleRoot.children).toEqual([])
    })
  })
})
