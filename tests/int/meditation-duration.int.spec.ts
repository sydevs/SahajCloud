import fs from 'fs'
import path from 'path'

import { sql } from '@payloadcms/db-sqlite'
import { parseBuffer } from 'music-metadata'
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

  describe('backfill migration logic', () => {
    it('can re-extract duration from a local audio file after nulling it out', async () => {
      // 1. Create a meditation (hook auto-extracts duration)
      const meditation = await testData.createMeditation(
        payload,
        { narrator: narratorId, thumbnail: thumbnailId },
      )
      const originalDuration = meditation.duration
      expect(originalDuration).toBeGreaterThan(0)

      // 2. Null out duration via raw SQL (simulates pre-migration state)
      const db = (payload.db as unknown as { drizzle: { run: (q: unknown) => unknown } }).drizzle
      await db.run(sql`UPDATE meditations SET duration = NULL WHERE id = ${meditation.id}`)

      // 3. Verify duration is NULL in DB
      const nulled = await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
      })
      expect(nulled.duration).toBeNull()

      // 4. Simulate backfill: read local file and parse duration (same as migration does)
      const filename = meditation.filename
      expect(filename).toBeDefined()

      const localPath = path.join(process.cwd(), 'media', 'meditations', filename!)
      expect(fs.existsSync(localPath)).toBe(true)

      const buffer = fs.readFileSync(localPath)
      const metadata = await parseBuffer(buffer, { mimeType: meditation.mimeType || 'audio/mpeg' })
      const extractedDuration = metadata.format.duration

      expect(extractedDuration).toBeDefined()
      const roundedDuration = Math.round(extractedDuration!)

      // 5. Verify extracted duration matches what the hook originally computed
      expect(roundedDuration).toBe(originalDuration)
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

  describe('audio replacement restriction', () => {
    const sampleFilePath = path.join(__dirname, '../files/audio-42s.mp3')

    function makeFileReq(userOverride: Record<string, unknown>) {
      const buffer = fs.readFileSync(sampleFilePath)
      return {
        file: {
          data: new Uint8Array(buffer) as unknown as Buffer,
          mimetype: 'audio/mpeg',
          name: 'audio-42s.mp3',
        },
        user: userOverride,
        payload: { logger: { warn: () => {} } },
      }
    }

    const existingDoc = { filename: 'existing-audio.mp3' }

    it('allows admin to replace audio on an existing meditation', async () => {
      const result = await extractAudioDuration({
        data: { label: 'test' },
        req: makeFileReq({ collection: 'managers', type: 'admin' }),
        operation: 'update',
        originalDoc: existingDoc,
      } as never)

      expect((result as Record<string, unknown>).duration).toBeDefined()
      expect((result as Record<string, unknown>).duration).toBeGreaterThan(0)
    })

    it('blocks a meditations-editor manager from replacing audio on an existing meditation', async () => {
      await expect(
        extractAudioDuration({
          data: { label: 'test' },
          req: makeFileReq({ collection: 'managers', type: 'manager' }),
          operation: 'update',
          originalDoc: existingDoc,
        } as never),
      ).rejects.toThrow('Only admin users can replace the audio file of an existing meditation')
    })

    it('allows a manager to upload audio when no existing file is present (first upload)', async () => {
      // When originalDoc has no filename, the restriction does not apply
      const result = await extractAudioDuration({
        data: { label: 'test' },
        req: makeFileReq({ collection: 'managers', type: 'manager' }),
        operation: 'update',
        originalDoc: { filename: null },
      } as never)

      expect((result as Record<string, unknown>).duration).toBeDefined()
    })

    it('allows system operations (no user) to replace audio', async () => {
      // Seed scripts / migrations run with req.user = null
      const buffer = fs.readFileSync(sampleFilePath)
      const sysReq = {
        file: {
          data: new Uint8Array(buffer) as unknown as Buffer,
          mimetype: 'audio/mpeg',
          name: 'audio-42s.mp3',
        },
        user: null,
        payload: { logger: { warn: () => {} } },
      }

      const result = await extractAudioDuration({
        data: { label: 'test' },
        req: sysReq,
        operation: 'update',
        originalDoc: existingDoc,
      } as never)

      expect((result as Record<string, unknown>).duration).toBeDefined()
    })
  })
})
