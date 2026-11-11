/**
 * Lessons collection custom-behavior tests.
 *
 * Basic CRUD and required-field validation are covered by collections-smoke.
 * This file holds tests for behavior that is project-specific.
 *
 * Currently: subtitle JSON behavior, article rich-text cleanup for stale
 * Lexical relationship nodes, and locale isolation for the meditation field,
 * the title and the panel list (all three are per-locale, and a locale with
 * no panels of its own still falls back to English).
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

  // The column became the intro file's transcript (#1016): what a step answers
  // is read off its file (`file-transcripts.int.spec.ts`), and a write to it
  // lands nowhere rather than beside a recording it may not match.
  describe('introSubtitles', () => {
    it('stores nothing written to it', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Subtitle Storage Test',
        meditation: testMeditation.id,
        introSubtitles: [{ startTimeMs: 300, endTimeMs: 2300, content: 'First caption' }],
      })

      const read = await payload.findByID({ collection: 'lessons', id: lesson.id, depth: 0 })
      expect(read.introSubtitles ?? null).toBeNull()
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

  describe('title and panels — locale isolation', () => {
    const enPanels = [{ title: 'What is Kundalini?', text: 'There is a dormant energy.' }]
    const frPanels = [{ title: "Qu'est-ce que la Kundalini ?", text: 'Une énergie dormante.' }]

    it('keeps English intact when the title and panels are written in French', async () => {
      const lesson = await testData.createLesson(payload, {
        title: 'Kundalini: The Power Within',
        panels: enPanels,
      })

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        data: { title: 'La Kundalini', panels: frPanels },
      })

      const en = await payload.findByID({ collection: 'lessons', id: lesson.id, depth: 0 })
      expect(en.title).toBe('Kundalini: The Power Within')
      expect(en.panels?.map((p) => p.text)).toEqual(['There is a dormant energy.'])

      const fr = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        depth: 0,
      })
      expect(fr.title).toBe('La Kundalini')
      expect(fr.panels?.map((p) => p.text)).toEqual(['Une énergie dormante.'])
    })

    it('keeps French intact when the title and panels are written in English', async () => {
      const lesson = await testData.createLesson(payload, { panels: enPanels })
      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        data: { title: 'La Kundalini', panels: frPanels },
      })

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        data: { title: 'Rewritten in English', panels: [{ text: 'Rewritten panel.' }] },
      })

      const fr = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        depth: 0,
      })
      expect(fr.title).toBe('La Kundalini')
      expect(fr.panels?.map((p) => p.text)).toEqual(['Une énergie dormante.'])
    })

    it('stores no French panels when only the French title is saved, so French falls back', async () => {
      const lesson = await testData.createLesson(payload, { panels: enPanels })

      await payload.update({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        data: { title: 'La Kundalini' },
      })

      const fr = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        depth: 0,
      })
      expect(fr.title).toBe('La Kundalini')
      expect(fr.panels?.map((p) => p.text)).toEqual(['There is a dormant energy.'])

      // The fallback is what is read, not a copy stored under `fr`: a panel
      // added in English must still reach a locale nobody has translated.
      const stored = await payload.findByID({
        collection: 'lessons',
        id: lesson.id,
        locale: 'fr',
        fallbackLocale: false,
        depth: 0,
      })
      expect(stored.panels ?? []).toEqual([])
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
      })
      // Planted past the hooks: Payload 3.90+ refuses a relationship to a
      // collection the editor doesn't enable at write time, so a stale node can
      // only be a row written before its collection was removed.
      await payload.db.updateOne({
        collection: 'lessons',
        id: lesson.id,
        data: { article: { en: staleArticle } },
      })
      const stored = await payload.db.findOne<{ id: number; article?: { en?: Lesson['article'] } }>(
        {
          collection: 'lessons',
          where: { id: { equals: lesson.id } },
        },
      )
      expect((stored?.article?.en?.root as { children: unknown[] }).children).toHaveLength(1)

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
