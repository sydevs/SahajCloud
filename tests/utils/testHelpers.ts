// Node.js and external dependencies
import { MongoClient } from 'mongodb'
import path from 'path'
import { fileURLToPath } from 'url'

// Payload CMS
import { getPayload, Payload } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import type { PayloadRequest, UploadConfig, CollectionConfig } from 'payload'

// Project imports
import { collections, Users } from '../../src/collections'
import { EmailTestAdapter } from './emailTestAdapter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Constants
const DEFAULT_EMAIL_TIMEOUT = 5000
const UPLOAD_COLLECTIONS = ['media', 'frames'] as const

/**
 * Creates test-specific collections with image resizing disabled.
 * Image resizing is disabled in tests to avoid sharp dependency issues
 * and to speed up test execution since we're not testing image processing functionality.
 * 
 * @returns Modified collections array with image resizing disabled for upload collections
 */
function getTestCollections(): CollectionConfig[] {
  return collections.map(collection => {
    // Disable image resizing for upload collections in tests
    if (UPLOAD_COLLECTIONS.includes(collection.slug as any)) {
      return {
        ...collection,
        upload: {
          ...(collection.upload as UploadConfig),
          imageSizes: [], // Disable image resizing to avoid sharp warnings and speed up tests
        },
      }
    }
    
    return collection
  })
}

/**
 * Creates the base Payload configuration for test environments
 * @param mongoUri Database URI for the test database
 * @param emailConfig Optional email configuration
 * @returns Payload configuration object
 */
function createBaseTestConfig(mongoUri: string, emailConfig?: any) {
  return buildConfig({
    admin: {
      user: Users.slug,
      disable: true, // Disable admin UI in tests
    },
    collections: getTestCollections(),
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    typescript: {
      outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
    },
    db: mongooseAdapter({
      url: mongoUri,
    }),
    email: emailConfig || nodemailerAdapter({
      defaultFromAddress: 'no-reply@test.com',
      defaultFromName: 'Test Suite',
    }),
  })
}

/**
 * Performs cleanup operations for test environments
 * @param payload The Payload instance to cleanup
 * @param baseUri Base MongoDB URI
 * @param testDbName Name of the test database to drop
 */
async function cleanupTestEnvironment(
  payload: Payload,
  baseUri: string,
  testDbName: string
): Promise<void> {
  // Close Payload connection
  try {
    if (payload.db && typeof payload.db.destroy === 'function') {
      await payload.db.destroy()
    }
  } catch (error) {
    // Failed to close Payload connection - continue with cleanup
  }

  // Drop the test database
  const client = new MongoClient(baseUri)
  try {
    await client.connect()
    await client.db(testDbName).dropDatabase()
  } catch (error) {
    // Failed to drop test database - not critical
  } finally {
    await client.close()
  }
}

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

  // Creating test environment with unique database

  const config = createBaseTestConfig(mongoUri)
  const payload = await getPayload({ config })

  const cleanup = () => cleanupTestEnvironment(payload, baseUri, testDbName)

  return { payload, cleanup }
}

/**
 * Creates an isolated test database and Payload instance with email support
 */
export async function createTestEnvironmentWithEmail(): Promise<{
  payload: Payload
  cleanup: () => Promise<void>
  emailAdapter: EmailTestAdapter
}> {
  const baseUri = process.env.TEST_MONGO_URI
  if (!baseUri) {
    throw new Error('TEST_MONGO_URI not available. Make sure globalSetup is configured.')
  }

  // Create a unique database name for this test environment
  const testDbName = `test_email_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const mongoUri = `${baseUri}${testDbName}?retryWrites=true&w=majority`

  // Creating test environment with email support and unique database

  // Initialize email adapter
  const emailAdapter = new EmailTestAdapter()
  await emailAdapter.init()
  const emailAdapterFn = EmailTestAdapter.create(emailAdapter)
  
  // Enhance the email adapter function to expose the adapter instance for testing
  const originalFn = emailAdapterFn
  const enhancedFn = () => {
    const result = originalFn()
    result.adapter = emailAdapter
    return result
  }

  // Create config with email adapter
  const config = createBaseTestConfig(mongoUri, enhancedFn)
  const payload = await getPayload({ config })
  const cleanup = () => cleanupTestEnvironment(payload, baseUri, testDbName)

  return { payload, cleanup, emailAdapter }
}

/**
 * Creates an authenticated request for testing
 */
export async function createAuthenticatedRequest(
  payload: Payload,
  userId: string
): Promise<PayloadRequest> {
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
  })

  return {
    user,
    headers: {},
    payload,
  } as PayloadRequest
}

/**
 * Wait for an email to be captured by the EmailTestAdapter
 */
/**
 * Waits for an email to be captured by the EmailTestAdapter
 * @param emailAdapter The email test adapter instance
 * @param timeout Timeout in milliseconds (default: 5000)
 */
export async function waitForEmail(
  emailAdapter: EmailTestAdapter,
  timeout: number = DEFAULT_EMAIL_TIMEOUT
): Promise<void> {
  await emailAdapter.waitForEmail(timeout)
}