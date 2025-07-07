import { getPayload, Payload } from 'payload'
import { createTestConfig } from '../config/test-payload.config'
import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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
 * Test data factory functions for creating consistent test data
 */
export const testDataFactory = {
  narrator: (overrides = {}) => ({
    name: 'Test Narrator',
    gender: 'male' as const,
    ...overrides,
  }),

  // Generic media factory (defaults to audio for backward compatibility)
  media: (overrides = {}) => ({
    data: {
      alt: 'Test media file',
      ...overrides,
    },
    file: {
      data: Buffer.from('test audio content'),
      mimetype: 'audio/mp3',
      name: 'test-audio.mp3',
      size: 1000,
    },
  }),

  // Image media factory using sample file
  mediaImage: (overrides = {}) => {
    const fileBuffer = readSampleFile('sample.jpg')
    return {
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
    }
  },

  // Audio media factory using sample file
  mediaAudio: (overrides = {}) => {
    const fileBuffer = readSampleFile('audio.mp3')
    return {
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
    }
  },

  // Video media factory using sample file
  mediaVideo: (overrides = {}) => {
    const fileBuffer = readSampleFile('video.mp4')
    return {
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
    }
  },

  tag: (overrides = {}) => ({
    title: 'Test Tag',
    ...overrides,
  }),

  meditation: (deps: { narrator: string; audioFile: string; thumbnail: string; tags?: string[]; musicTag?: string }, overrides = {}) => ({
    title: 'Test Meditation',
    duration: 15,
    thumbnail: deps.thumbnail,
    audioFile: deps.audioFile,
    narrator: deps.narrator,
    tags: deps.tags || [],
    musicTag: deps.musicTag,
    isPublished: false,
    ...overrides,
  }),

  // Music factory using sample audio file
  music: (overrides = {}) => {
    const fileBuffer = readSampleFile('audio.mp3')
    return {
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
    }
  },
}