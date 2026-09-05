/**
 * Lessons collection custom-behavior tests.
 *
 * Basic CRUD and required-field validation are covered by collections-smoke.
 * This file holds tests for behavior that is project-specific.
 *
 * Currently: subtitle JSON behavior, article rich-text cleanup for stale
 * Lexical relationship nodes, and meditation field locale isolation
 * (per-locale meditation assignments are independent).
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
      const validSubtitles = [
        { startTimeMs: 300, endTimeMs: 2300, durationMs: 2000, content: 'First caption' },
        { startTimeMs: 2500, endTimeMs: 4500, content: 'Second caption' },
      ]

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle Storage Test',
        meditation: testMeditation.id,
        introSubtitles: validSubtitles,
      })

      expect(lesson.introSubtitles).toEqual(validSubtitles)
    })

    it('accepts subtitle data with extra fields not in jsonSchema', async () => {
      // Documents intentional behavior: the validator only checks the required
      // cue fields, so legacy cue fields can still be stored.
      const subtitlesWithLegacyField = [
        {
          startTimeMs: 300,
          endTimeMs: 2300,
          durationMs: 2000,
          content: 'Caption with legacy field',
          startOfParagraph: null,
        },
      ]

      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle Legacy Field Test',
        meditation: testMeditation.id,
        introSubtitles: subtitlesWithLegacyField,
      })

      expect(lesson.introSubtitles).toEqual(subtitlesWithLegacyField)
    })
  })

  describe('meditation field — locale isolation', () => {
    let enMeditation: Meditation
    let esMeditation: Meditation

    beforeAll(async () => {
      enMeditation = await testData.createMeditation(payload, undefined, {
        type: 'lesson',
        locale: 'en',
      })
      esMeditation = await testData.createMeditation(payload, undefined, {
        type: 'lesson',
        locale: 'es',
      })
    })

    it('en meditation does not appear in es locale when fallbackLocale is false', async () => {
      const lesson = await testData.createLesson(payload, { meditation: enMeditation.id })

      const fetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'es',
        fallbackLocale: false,
        depth: 0,
      })

      // Payload returns undefined (no locale row) rather than null when fallbackLocale is false
      expect(fetched.meditation).toBeFalsy()
    })

    it('assigns different meditation per locale without overwriting the other', async () => {
      const lesson = await testData.createLesson(payload, { meditation: enMeditation.id })

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'es',
        data: { meditation: { relationTo: 'meditations', value: esMeditation.id } },
      })

      // English locale retains the original assignment
      const enFetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'en',
        depth: 0,
      })
      expect(enFetched.meditation).toEqual({ relationTo: 'meditations', value: enMeditation.id })

      // Spanish locale has the Spanish assignment
      const esFetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'es',
        depth: 0,
      })
      expect(esFetched.meditation).toEqual({ relationTo: 'meditations', value: esMeditation.id })
    })
  })

  describe('meditation field — video link', () => {
    it('links a video instead of a meditation via the polymorphic shape', async () => {
      const video = await testData.createVideo(payload)

      const lesson = await testData.createLesson(payload, {
        title: 'Lesson with a video meditation',
        meditation: { relationTo: 'videos', value: video.id },
      })

      const fetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 0,
      })

      expect(fetched.meditation).toEqual({ relationTo: 'videos', value: video.id })
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
