import { getPayload, Payload } from 'payload'
import { createTestConfig } from '../config/test-payload.config'
import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Narrator, Media, Tag, Meditation, Music } from '@/payload-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

/**
 * Creates an isolated test database and Payload instance for a test suite
 * Each call creates a unique database name to ensure complete isolation
 */
export async function createTestEnvironment(): Promise<{
  payload: Payload
  cleanup: () => Promise<void>
}> {
  const baseUri = process.env.TEST_MONGO_URI
  if (!baseUri) {
    throw new Error('TEST_MONGO_URI not available. Make sure globalSetup is configured.')
  }

  // Create a unique database name for this test environment
  const testDbName = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const mongoUri = `${baseUri}${testDbName}?retryWrites=true&w=majority`

  console.log(`🧪 Creating test environment with database: ${testDbName}`)

  const config = createTestConfig(mongoUri)
  const payload = await getPayload({ config })

  const cleanup = async () => {
    console.log(`🧹 Cleaning up test environment: ${testDbName}`)
    
    try {
      // Close Payload connection
      if (payload.db && typeof payload.db.destroy === 'function') {
        await payload.db.destroy()
      }
    } catch (error) {
      console.warn('Failed to close Payload connection:', error)
    }

    // Drop the test database
    const client = new MongoClient(baseUri)
    try {
      await client.connect()
      await client.db(testDbName).dropDatabase()
      console.log(`✅ Dropped test database: ${testDbName}`)
    } catch (error) {
      console.warn(`⚠️ Failed to drop test database ${testDbName}:`, error)
    } finally {
      await client.close()
    }
  }

  return { payload, cleanup }
}

/**
 * Helper function to read sample files for tests
 */
function readSampleFile(filename: string) {
  const filePath = path.join(SAMPLE_FILES_DIR, filename)
  return fs.readFileSync(filePath)
}

/**
 * Test data factory functions for creating test entities with payload.create()
 */
export const testDataFactory = {
  /**
   * Create a narrator
   */
  async createNarrator(payload: Payload, overrides = {}): Promise<Narrator> {
    return await payload.create({
      collection: 'narrators',
      data: {
        name: 'Test Narrator',
        gender: 'male' as const,
        ...overrides,
      },
    }) as Narrator
  },

  /**
   * Create image media using sample file
   */
  async createMediaImage(payload: Payload, overrides = {}): Promise<Media> {
    const fileBuffer = readSampleFile('sample.jpg')
    return await payload.create({
      collection: 'media',
      data: {
        alt: 'Test image file',
        ...overrides,
      },
      file: {
        data: fileBuffer,
        mimetype: 'image/jpeg',
        name: 'sample.jpg',
        size: fileBuffer.length,
      },
    }) as Media
  },

  /**
   * Create audio media using sample file
   */
  async createMediaAudio(payload: Payload, overrides = {}): Promise<Media> {
    const fileBuffer = readSampleFile('audio.mp3')
    return await payload.create({
      collection: 'media',
      data: {
        alt: 'Test audio file',
        ...overrides,
      },
      file: {
        data: fileBuffer,
        mimetype: 'audio/mp3',
        name: 'audio.mp3',
        size: fileBuffer.length,
      },
    }) as Media
  },

  /**
   * Create video media using sample file
   */
  async createMediaVideo(payload: Payload, overrides = {}): Promise<Media> {
    const fileBuffer = readSampleFile('video.mp4')
    return await payload.create({
      collection: 'media',
      data: {
        alt: 'Test video file',
        ...overrides,
      },
      file: {
        data: fileBuffer,
        mimetype: 'video/mp4',
        name: 'video.mp4',
        size: fileBuffer.length,
      },
    }) as Media
  },

  /**
   * Create a tag
   */
  async createTag(payload: Payload, overrides = {}): Promise<Tag> {
    return await payload.create({
      collection: 'tags',
      data: {
        title: 'Test Tag',
        ...overrides,
      },
    }) as Tag
  },

  /**
   * Create a meditation with required dependencies
   */
  async createMeditation(payload: Payload, deps: { narrator: string; audioFile: string; thumbnail: string; tags?: string[]; musicTag?: string }, overrides = {}): Promise<Meditation> {
    return await payload.create({
      collection: 'meditations',
      data: {
        title: 'Test Meditation',
        duration: 15,
        thumbnail: deps.thumbnail,
        audioFile: deps.audioFile,
        narrator: deps.narrator,
        tags: deps.tags || [],
        musicTag: deps.musicTag,
        isPublished: false,
        ...overrides,
      },
    }) as Meditation
  },

  /**
   * Create music track using sample audio file
   */
  async createMusic(payload: Payload, overrides = {}): Promise<Music> {
    const fileBuffer = readSampleFile('audio.mp3')
    return await payload.create({
      collection: 'music',
      data: {
        title: 'Test Music Track',
        credit: 'Test Artist',
        ...overrides,
      },
      file: {
        data: fileBuffer,
        mimetype: 'audio/mp3',
        name: 'audio.mp3',
        size: fileBuffer.length,
      },
    }) as Music
  },

  /**
   * Create music track with custom audio format
   */
  async createMusicWithFormat(payload: Payload, format: { mimetype: string; name: string }, overrides = {}): Promise<Music> {
    const fileBuffer = readSampleFile('audio.mp3')
    return await payload.create({
      collection: 'music',
      data: {
        title: 'Test Music Track',
        credit: 'Test Artist',
        ...overrides,
      },
      file: {
        data: fileBuffer,
        mimetype: format.mimetype,
        name: format.name,
        size: fileBuffer.length,
      },
    }) as Music
  },

}