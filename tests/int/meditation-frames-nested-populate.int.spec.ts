import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Meditation, UserChoice } from '@/payload-types'
import type { KeyframeDefinition } from '@/types/frames'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Regression: a meditation's timed `frames` must survive NESTED relationship
 * population even when the caller's projection does not name `frames`.
 *
 * `frames` is a stored `json` field whose value is produced by a field-level
 * `afterRead` enrichment hook (Meditations.ts). When a meditation is populated
 * as a nested relationship, Payload projects it with a `select` derived from the
 * caller's `populate` / the collection's `defaultPopulate`. If that projection
 * is INCLUDE-mode and omits `frames`, Payload strips the field before its
 * enrichment hook runs, so it comes back ABSENT (not empty) — while a direct
 * `GET /api/meditations/{id}` that selects `frames` is unaffected.
 *
 * This is what broke the live We Meditate app: the first meditation
 * (`wm-app-config.selfRealizationMeditation`) and personalised/quick meditations
 * (`user-choices.morningMeditation` etc.) are consumed as NESTED relationships,
 * and their `frames` arrived absent, so the player fell back to the thumbnail.
 *
 * `forceSelect: { frames: true }` on the Meditations collection deep-merges
 * `frames` into every include-mode read of a meditation (Payload sanitizeSelect),
 * so the field is always read and its enrichment hook always runs — for nested
 * populates exactly as it already does top-level. This test omits `frames` from
 * the nested projection on purpose: it FAILS before the fix (frames absent) and
 * PASSES after.
 */
describe('Meditation frames survive nested relationship population', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let meditation: Meditation
  let tag: UserChoice

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    const narrator = await testData.createNarrator(payload, { gender: 'male' })
    const thumbnail = await testData.createMediaImage(payload)
    const frame1 = await testData.createFrame(payload, { imageSet: 'male' })
    const frame2 = await testData.createFrame(payload, { imageSet: 'male' })

    meditation = await testData.createMeditation(
      payload,
      { narrator: narrator.id, thumbnail: thumbnail.id },
      { type: 'daily', _status: 'published' },
    )

    const frames: KeyframeDefinition[] = [
      { id: String(frame1.id), timestamp: 0 },
      { id: String(frame2.id), timestamp: 30 },
    ]
    await payload.update({
      collection: 'meditations',
      id: meditation.id,
      data: { frames },
    })

    tag = (await testData.createUserChoice(payload, { title: 'Nested Frames Tag' })) as UserChoice
    await payload.update({
      collection: 'user-choices',
      id: tag.id,
      data: { morningMeditation: meditation.id },
      locale: 'en',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('enriches frames on a DIRECT meditation read (baseline sanity)', async () => {
    const med = (await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
    })) as Meditation

    expect(Array.isArray(med.frames)).toBe(true)
    expect((med.frames as unknown[]).length).toBe(2)
    expect((med.frames as Array<{ imageSet?: string }>)[0].imageSet).toBe('male')
  })

  it('populates enriched frames — plus every app-consumed field — when nested via defaultPopulate', async () => {
    // The app consumes the meditation as a NESTED relationship without an
    // explicit `populate[meditations]`, so Payload projects it via the
    // collection's `defaultPopulate`. That allow-list must name `frames` (so its
    // enrichment afterRead runs) AND every other field the app reads.
    const result = await payload.find({
      collection: 'user-choices',
      where: { id: { equals: tag.id } },
      depth: 2,
      locale: 'en',
    })

    const nested = result.docs[0]?.morningMeditation as Meditation
    expect(nested?.id).toBe(meditation.id)

    // The fix: enriched frames present on the nested meditation.
    expect(Array.isArray(nested.frames)).toBe(true)
    expect((nested.frames as unknown[]).length).toBe(2)
    expect((nested.frames as Array<{ imageSet?: string }>)[0].imageSet).toBe('male')

    // Completeness: every field the app reads from the embedded meditation must
    // survive the include-mode allow-list (the case-C url-drop risk).
    for (const field of [
      'title',
      'label',
      'type',
      'duration',
      'durationMinutes',
      'url',
      'thumbnailURL',
      'thumbnail',
      'narrator',
      'songTag',
      'subtleSystemNodeWeights',
    ]) {
      expect(nested, `nested meditation should carry \`${field}\``).toHaveProperty(field)
    }

    // The prior exclude of the expensive tagAssignments join is preserved.
    expect((nested as { tagAssignments?: unknown }).tagAssignments).toBeUndefined()
  })
})
