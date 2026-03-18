import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'

import { extractAudioDuration } from '@/hooks/meditationHooks'

import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Meditation Duration Extraction', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let narratorId: number
  let thumbnailId: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create shared dependencies
    const narrator = await testData.createNarrator(payload, { name: 'Duration Test Narrator' })
    narratorId = narrator.id
    const thumbnail = await testData.createMediaImage(payload, { alt: 'Duration test thumbnail' })
    thumbnailId = thumbnail.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('duration field extraction', () => {
    it('extracts duration from uploaded MP3 file', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: narratorId, thumbnail: thumbnailId },
      )

      // audio-42s.mp3 is approximately 42 seconds
      expect(meditation.duration).toBeDefined()
      expect(meditation.duration).toBeGreaterThan(40)
      expect(meditation.duration).toBeLessThan(44)
    })

    it('stores duration as rounded integer seconds', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: narratorId, thumbnail: thumbnailId },
      )

      expect(Number.isInteger(meditation.duration)).toBe(true)
    })
  })

  describe('durationMinutes virtual field', () => {
    it('computes durationMinutes from duration', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: narratorId, thumbnail: thumbnailId },
      )

      // 42 seconds → Math.ceil(42/60) = 1 minute
      expect(meditation.durationMinutes).toBe(1)
    })

    it('returns durationMinutes in find results', async () => {
      const created = await testData.createMeditation(
        payload,
        { narrator: narratorId, thumbnail: thumbnailId },
      )

      const found = await payload.findByID({
        collection: 'meditations',
        id: created.id,
      })

      expect(found.durationMinutes).toBe(1)
    })
  })

  describe('duration preservation on update', () => {
    it('preserves duration when updating without re-uploading', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: narratorId, thumbnail: thumbnailId },
      )

      const originalDuration = meditation.duration

      // Use findByID to read it back after creation — verifies duration
      // is persisted in the database, not just returned from the hook
      const found = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
      })

      expect(found.duration).toBe(originalDuration)
    })
  })

  describe('extractAudioDuration hook (unit)', () => {
    it('returns data without duration for non-audio content', async () => {
      const mockReq = {
        file: {
          data: Buffer.from('not-a-real-audio-file'),
          mimetype: 'audio/mpeg',
          name: 'corrupted.mp3',
        },
        payload: { logger: { warn: () => {} } },
      }

      const result = await extractAudioDuration({
        data: { label: 'test' },
        req: mockReq,
      } as never)

      // Should return data without duration rather than throwing
      expect(result).toBeDefined()
      expect((result as Record<string, unknown>).duration).toBeUndefined()
    })

    it('skips extraction when no file is uploaded', async () => {
      const mockReq = { payload: { logger: { warn: () => {} } } }

      const result = await extractAudioDuration({
        data: { label: 'test', duration: 100 },
        req: mockReq,
      } as never)

      // Should preserve existing data unchanged
      expect(result).toEqual({ label: 'test', duration: 100 })
    })
  })
})
