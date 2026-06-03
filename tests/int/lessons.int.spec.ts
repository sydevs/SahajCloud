/**
 * Lessons collection custom-behavior tests.
 *
 * Basic CRUD and required-field validation are covered by collections-smoke;
 * this file holds tests for behavior that's project-specific.
 *
 * Currently: subtitle JSON behavior, article rich-text cleanup for stale
 * Lexical relationship nodes, meditation field locale isolation
 * (per-locale meditation assignments are independent), and video-meditation
 * fields (kind toggle, localized video + prescreen lines, per-locale isolation).
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
      enMeditation = await testData.createMeditation(payload, undefined, { type: 'lesson', locale: 'en' })
      esMeditation = await testData.createMeditation(payload, undefined, { type: 'lesson', locale: 'es' })
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
        data: { meditation: esMeditation.id },
      })

      // English locale retains the original assignment
      const enFetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'en',
        depth: 0,
      })
      expect(enFetched.meditation).toBe(enMeditation.id)

      // Spanish locale has the Spanish assignment
      const esFetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'es',
        depth: 0,
      })
      expect(esFetched.meditation).toBe(esMeditation.id)
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

  describe('video meditation — fields + locale isolation', () => {
    it('persists meditationKind=video with a video and prescreen lines', async () => {
      const video = await testData.createVideo(payload, { title: 'Lesson Video', tags: 'technique' })

      const lesson = await testData.createLesson(payload, {
        title: 'Video Meditation Lesson',
        meditationKind: 'video',
        video: video.id,
        prescreenLines: [{ line: 'Take a breath' }, { line: 'Settle in' }],
      })

      const fetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        depth: 0,
      })

      expect(fetched.meditationKind).toBe('video')
      expect(fetched.meditation).toBeFalsy() // a video meditation replaces the audio meditation
      expect(fetched.video).toBe(video.id)
      expect(fetched.prescreenLines).toHaveLength(2)
      expect(fetched.prescreenLines?.[0]?.line).toBe('Take a breath')
    })

    it('assigns a different video and prescreen lines per locale without overwriting', async () => {
      const enVideo = await testData.createVideo(payload, { title: 'EN Lesson Video' })
      const esVideo = await testData.createVideo(payload, { title: 'ES Lesson Video' })

      const lesson = await testData.createLesson(payload, {
        meditationKind: 'video',
        video: enVideo.id,
        prescreenLines: [{ line: 'EN line' }],
      })

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'es',
        data: { video: esVideo.id, prescreenLines: [{ line: 'ES line' }] },
      })

      // English locale retains its original video + lines
      const enFetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'en',
        depth: 0,
      })
      expect(enFetched.video).toBe(enVideo.id)
      expect(enFetched.prescreenLines?.[0]?.line).toBe('EN line')

      // Spanish locale has the Spanish video + lines
      const esFetched = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'es',
        depth: 0,
      })
      expect(esFetched.video).toBe(esVideo.id)
      expect(esFetched.prescreenLines?.[0]?.line).toBe('ES line')
    })
  })
})
