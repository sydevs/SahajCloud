import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  buildProgressWhereClause,
  countLecturesForAudiences,
  resolveAudienceIds,
} from '@/lib/audiences/resolve'
import type { Audience } from '@/payload-types'


import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — prevents real network calls when seeding
// lectures in the `countLecturesForAudiences` describe block.
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(
    join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'),
  )
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: new Uint8Array(imgBuffer),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail.jpg',
      size: imgBuffer.length,
    }),
  }
})

const BASE_PARAMS = {
  pathProgress: 0,
  meditationsPerWeek: 0,
  totalMeditationsViewed: 0,
  totalLecturesViewed: 0,
  country: 'US',
}

describe('audiences/resolve', () => {
  let payload: Payload

  let audienceOpen: Audience
  let audienceMinOnly: Audience
  let audienceMaxOnly: Audience
  let audienceBothBounds: Audience
  let audienceUSOnly: Audience
  let audienceMultiCountry: Audience
  let audienceProgressAndCountry: Audience
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    audienceOpen = await testData.createAudience(payload, { label: 'Open' })
    audienceMinOnly = await testData.createAudience(payload, {
      label: 'MinOnly',
      pathProgress: { min: 3 },
    })
    audienceMaxOnly = await testData.createAudience(payload, {
      label: 'MaxOnly',
      meditationsPerWeek: { max: 5 },
    })
    audienceBothBounds = await testData.createAudience(payload, {
      label: 'BothBounds',
      totalLecturesViewed: { min: 2, max: 10 },
    })
    audienceUSOnly = await testData.createAudience(payload, {
      label: 'USOnly',
      location: { countries: ['US'] },
    })
    audienceMultiCountry = await testData.createAudience(payload, {
      label: 'MultiCountry',
      location: { countries: ['US', 'CA', 'GB'] },
    })
    audienceProgressAndCountry = await testData.createAudience(payload, {
      label: 'ProgressAndCountry',
      pathProgress: { min: 5 },
      location: { countries: ['US'] },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('buildProgressWhereClause', () => {
    it('emits one AND-wrapped (min, max) pair per progress rule', () => {
      const where = buildProgressWhereClause(BASE_PARAMS)
      expect(where).toHaveProperty('and')
      const conditions = (where as { and: unknown[] }).and
      // 4 rules: pathProgress, meditationsPerWeek, totalMeditationsViewed, totalLecturesViewed.
      expect(conditions).toHaveLength(4)
    })

    it('each rule combines (min not set OR min<=value) AND (max not set OR max>=value)', () => {
      const where = buildProgressWhereClause({ ...BASE_PARAMS, pathProgress: 7 })
      const conditions = (where as { and: Array<{ and: unknown[] }> }).and
      const pathRule = conditions[0]
      expect(pathRule.and).toHaveLength(2)
      const [minCheck, maxCheck] = pathRule.and as Array<{ or: unknown[] }>
      expect(minCheck.or).toEqual([
        { 'pathProgress.min': { exists: false } },
        { 'pathProgress.min': { less_than_equal: 7 } },
      ])
      expect(maxCheck.or).toEqual([
        { 'pathProgress.max': { exists: false } },
        { 'pathProgress.max': { greater_than_equal: 7 } },
      ])
    })
  })

  describe('resolveAudienceIds — progress dimensions', () => {
    it('includes audience with no constraints (open)', async () => {
      const ids = await resolveAudienceIds(payload, BASE_PARAMS)
      expect(ids).toContain(audienceOpen.id)
    })

    it('includes min-only audience when value meets the floor', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, pathProgress: 3 })
      expect(ids).toContain(audienceMinOnly.id)
    })

    it('excludes min-only audience when value is below the floor', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, pathProgress: 2 })
      expect(ids).not.toContain(audienceMinOnly.id)
    })

    it('includes max-only audience when value is at or under the ceiling', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, meditationsPerWeek: 5 })
      expect(ids).toContain(audienceMaxOnly.id)
    })

    it('excludes max-only audience when value exceeds the ceiling', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, meditationsPerWeek: 6 })
      expect(ids).not.toContain(audienceMaxOnly.id)
    })

    it('includes both-bounds audience for values inside the inclusive range', async () => {
      for (const totalLecturesViewed of [2, 6, 10]) {
        const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, totalLecturesViewed })
        expect(ids).toContain(audienceBothBounds.id)
      }
    })

    it('excludes both-bounds audience for values outside the range', async () => {
      for (const totalLecturesViewed of [1, 11]) {
        const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, totalLecturesViewed })
        expect(ids).not.toContain(audienceBothBounds.id)
      }
    })
  })

  describe('resolveAudienceIds — country gate', () => {
    it('matches when caller country is in the audience country list', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, country: 'US' })
      expect(ids).toContain(audienceUSOnly.id)
    })

    it('excludes when caller country is not in the audience country list', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, country: 'DE' })
      expect(ids).not.toContain(audienceUSOnly.id)
    })

    it('matches when caller country is one of several allowed countries', async () => {
      const ids = await resolveAudienceIds(payload, { ...BASE_PARAMS, country: 'CA' })
      expect(ids).toContain(audienceMultiCountry.id)
    })

    it('requires both progress and country to match when both are set', async () => {
      // Country matches, progress fails → excluded
      let ids = await resolveAudienceIds(payload, {
        ...BASE_PARAMS,
        pathProgress: 0,
        country: 'US',
      })
      expect(ids).not.toContain(audienceProgressAndCountry.id)

      // Progress matches, country fails → excluded
      ids = await resolveAudienceIds(payload, {
        ...BASE_PARAMS,
        pathProgress: 5,
        country: 'DE',
      })
      expect(ids).not.toContain(audienceProgressAndCountry.id)

      // Both match → included
      ids = await resolveAudienceIds(payload, {
        ...BASE_PARAMS,
        pathProgress: 5,
        country: 'US',
      })
      expect(ids).toContain(audienceProgressAndCountry.id)
    })
  })

  describe('resolveAudienceIds — output shape', () => {
    it('returns IDs sorted numerically ascending', async () => {
      const ids = await resolveAudienceIds(payload, BASE_PARAMS)
      const sorted = [...ids].sort((a, b) => a - b)
      expect(ids).toEqual(sorted)
    })
  })

  describe('countLecturesForAudiences', () => {
    it('returns 0 immediately when the audience list is empty (no DB hit)', async () => {
      const count = await countLecturesForAudiences(payload, { audiences: [] })
      expect(count).toBe(0)
    })

    it('returns the number of lectures with overlapping audience IDs', async () => {
      const tagAudience = await testData.createAudience(payload, { label: 'LectureAudience' })
      const otherAudience = await testData.createAudience(payload, { label: 'OtherAudience' })

      await testData.createLecture(payload, undefined, { audiences: [tagAudience.id] })
      await testData.createLecture(payload, undefined, { audiences: [tagAudience.id] })
      await testData.createLecture(payload, undefined, { audiences: [otherAudience.id] })

      const count = await countLecturesForAudiences(payload, { audiences: [tagAudience.id] })
      expect(count).toBeGreaterThanOrEqual(2)

      const countBoth = await countLecturesForAudiences(payload, {
        audiences: [tagAudience.id, otherAudience.id],
      })
      expect(countBoth).toBeGreaterThan(count)
    })
  })
})
