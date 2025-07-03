import { getPayload, Payload } from 'payload'
import { createTestConfig } from '../config/test-payload.config'
import { MongoClient } from 'mongodb'

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
 * Test data factory functions for creating consistent test data
 */
export const testDataFactory = {
  narrator: (overrides = {}) => ({
    name: 'Test Narrator',
    gender: 'male' as const,
    ...overrides,
  }),

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
}