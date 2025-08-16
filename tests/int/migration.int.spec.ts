import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { DatabaseConnection } from '@/scripts/migration/config/database'
import { SchemaAnalyzer } from '@/scripts/migration/analyzers/SchemaAnalyzer'
import { TagsMigrator } from '@/scripts/migration/migrators/TagsMigrator'
import { MediaTransfer } from '@/scripts/migration/utils/mediaTransfer'
import { DataValidator } from '@/scripts/migration/utils/validation'
import { MigrationReporter } from '@/scripts/migration/utils/reporting'

describe('Migration Components', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('DatabaseConnection', () => {
    it('should handle connection configuration', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
      }

      const db = new DatabaseConnection(config)
      expect(db).toBeDefined()
    })
  })

  describe('SchemaAnalyzer', () => {
    it('should create schema analyzer instance', () => {
      const mockDb = {
        query: vi.fn(),
      } as any

      const analyzer = new SchemaAnalyzer(mockDb)
      expect(analyzer).toBeDefined()
    })

    it('should analyze table schema', async () => {
      const mockDb = {
        query: vi.fn()
          .mockResolvedValueOnce([
            {
              column_name: 'id',
              data_type: 'integer',
              is_nullable: 'NO',
              column_default: null,
              character_maximum_length: null,
            },
            {
              column_name: 'title',
              data_type: 'varchar',
              is_nullable: 'NO',
              column_default: null,
              character_maximum_length: 255,
            },
          ])
          .mockResolvedValueOnce([{ column_name: 'id' }])
          .mockResolvedValueOnce([]),
      } as any

      const analyzer = new SchemaAnalyzer(mockDb)
      const schema = await analyzer.analyzeTable('test_table')

      expect(schema.tableName).toBe('test_table')
      expect(schema.columns).toHaveLength(2)
      expect(schema.primaryKey).toEqual(['id'])
      expect(schema.foreignKeys).toHaveLength(0)
    })
  })

  describe('DataValidator', () => {
    let validator: DataValidator

    beforeAll(() => {
      validator = new DataValidator(payload)
    })

    it('should validate tags data', async () => {
      const validTag = {
        title: { en: 'Test Tag', it: 'Tag di Test' },
      }

      const error = await validator.validateTags(validTag)
      expect(error).toBeNull()
    })

    it('should reject invalid tags data', async () => {
      const invalidTag = {}

      const error = await validator.validateTags(invalidTag)
      expect(error).toContain('Missing required field: title')
    })

    it('should validate music data', async () => {
      const validMusic = {
        title: { en: 'Test Song', it: 'Canzone di Test' },
        tags: ['tag-id-1', 'tag-id-2'],
      }

      const error = await validator.validateMusic(validMusic)
      expect(error).toBeNull()
    })

    it('should validate frames data', async () => {
      const validFrame = {
        name: 'Test Frame',
        imageSet: 'male',
      }

      const error = await validator.validateFrames(validFrame)
      expect(error).toBeNull()
    })

    it('should reject invalid frames data', async () => {
      const invalidFrame = {
        name: 'Test Frame',
        imageSet: 'invalid',
      }

      const error = await validator.validateFrames(invalidFrame)
      expect(error).toContain('Invalid or missing imageSet')
    })

    it('should validate meditations data', async () => {
      const validMeditation = {
        title: 'Test Meditation',
        locale: 'en',
        narrator: 'narrator-id',
        frames: [
          { frame: 'frame-id-1', timestamp: 0 },
          { frame: 'frame-id-2', timestamp: 10 },
        ],
      }

      const error = await validator.validateMeditations(validMeditation)
      expect(error).toBeNull()
    })

    it('should reject meditations with duplicate timestamps', async () => {
      const invalidMeditation = {
        title: 'Test Meditation',
        locale: 'en',
        narrator: 'narrator-id',
        frames: [
          { frame: 'frame-id-1', timestamp: 0 },
          { frame: 'frame-id-2', timestamp: 0 }, // Duplicate
        ],
      }

      const error = await validator.validateMeditations(invalidMeditation)
      expect(error).toContain('Duplicate timestamp')
    })
  })

  describe('TagsMigrator', () => {
    it('should parse comma-separated tags', () => {
      const tagString = 'meditation, relaxation, mindfulness'
      const tags = TagsMigrator.parseTags(tagString)
      
      expect(tags).toEqual(['meditation', 'relaxation', 'mindfulness'])
    })

    it('should handle empty tag strings', () => {
      const tags = TagsMigrator.parseTags(null)
      expect(tags).toEqual([])
    })

    it('should normalize tag names', () => {
      const tagString = '  Meditation  ,  RELAXATION  ,mindfulness  '
      const tags = TagsMigrator.parseTags(tagString)
      
      expect(tags).toEqual(['meditation', 'relaxation', 'mindfulness'])
    })
  })

  describe('MediaTransfer', () => {
    it('should extract filename from URL', () => {
      const mediaTransfer = new MediaTransfer(payload, 'https://example.com/uploads')
      
      // Access private method through prototype
      const extractFilename = (mediaTransfer as any).extractFilename.bind(mediaTransfer)
      const filename = extractFilename('https://example.com/uploads/image.jpg')
      
      expect(filename).toMatch(/^image_\d+\.jpg$/)
    })

    it('should determine mime type from filename', () => {
      const mediaTransfer = new MediaTransfer(payload, 'https://example.com/uploads')
      
      // Access private method through prototype
      const getMimeType = (mediaTransfer as any).getMimeType.bind(mediaTransfer)
      
      expect(getMimeType('image.jpg')).toBe('image/jpeg')
      expect(getMimeType('audio.mp3')).toBe('audio/mpeg')
      expect(getMimeType('video.mp4')).toBe('video/mp4')
      expect(getMimeType('unknown.xyz')).toBe('application/octet-stream')
    })
  })

  describe('MigrationReporter', () => {
    it('should format bytes correctly', () => {
      const reporter = new MigrationReporter()
      
      expect(reporter.formatBytes(0)).toBe('0 Bytes')
      expect(reporter.formatBytes(1024)).toBe('1 KB')
      expect(reporter.formatBytes(1048576)).toBe('1 MB')
      expect(reporter.formatBytes(1073741824)).toBe('1 GB')
    })

    it('should track migration results', () => {
      const reporter = new MigrationReporter()
      
      reporter.addResult({
        collection: 'tags',
        total: 100,
        success: 98,
        failed: 2,
        errors: [],
        mediaTransferred: 0,
        mediaSizeBytes: 0,
      })

      reporter.addResult({
        collection: 'music',
        total: 50,
        success: 50,
        failed: 0,
        errors: [],
        mediaTransferred: 50,
        mediaSizeBytes: 524288000, // 500 MB
      })

      // Test that results are tracked (no public getter, so we test indirectly)
      expect(() => reporter.printSummary(true)).not.toThrow()
    })
  })

  describe('Migration Integration', () => {
    it('should create tags in Payload', async () => {
      const tagData = {
        title: {
          en: 'Test Migration Tag',
          it: 'Tag di Migrazione Test',
        },
      }

      const created = await payload.create({
        collection: 'tags',
        data: tagData,
      })

      expect(created).toBeDefined()
      expect(created.id).toBeDefined()
      expect(created.title).toEqual(tagData.title)
    })

    it('should handle relationships between collections', async () => {
      // Create a tag
      const tag = await payload.create({
        collection: 'tags',
        data: {
          title: {
            en: 'Relationship Test Tag',
            it: 'Tag Test Relazione',
          },
        },
      })

      // Create a narrator
      const narrator = await payload.create({
        collection: 'narrators',
        data: {
          name: 'Test Narrator',
          gender: 'male',
          slug: 'test-narrator',
        },
      })

      // Create a frame
      const frame = await payload.create({
        collection: 'frames',
        data: {
          name: 'Test Frame',
          imageSet: 'male',
          tags: [tag.id],
          filename: 'test-frame.jpg',
          url: '/media/frames/test-frame.jpg',
          mimeType: 'image/jpeg',
          filesize: 1024,
        },
      })

      // Create a meditation with relationships
      const meditation = await payload.create({
        collection: 'meditations',
        data: {
          title: 'Test Meditation',
          locale: 'en',
          narrator: narrator.id,
          tags: [tag.id],
          frames: [
            {
              frame: frame.id,
              timestamp: 0,
            },
          ],
          filename: 'test-meditation.mp3',
          url: '/media/meditations/test-meditation.mp3',
          mimeType: 'audio/mpeg',
          filesize: 5242880,
        },
      })

      expect(meditation).toBeDefined()
      expect(meditation.narrator).toBe(narrator.id)
      expect(meditation.tags).toContain(tag.id)
      expect(meditation.frames).toHaveLength(1)
      expect(meditation.frames[0].frame).toBe(frame.id)
      expect(meditation.frames[0].timestamp).toBe(0)
    })
  })
})