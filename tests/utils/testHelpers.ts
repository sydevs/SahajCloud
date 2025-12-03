// Node.js and external dependencies
import type { PayloadRequest, UploadConfig, CollectionConfig } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

// Payload CMS
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { getPayload, Payload } from 'payload'
import { buildConfig } from 'payload'

// Project imports
import type { Manager, Client } from '@/payload-types'

import { EmailTestAdapter } from './emailTestAdapter'
import { testData } from './testData'
import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import { tasks } from '../../src/jobs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Constants
const DEFAULT_EMAIL_TIMEOUT = 5000
const UPLOAD_COLLECTIONS: readonly string[] = ['images', 'frames', 'files']

/**
 * Creates test-specific collections with image resizing disabled.
 * Image resizing is disabled in tests to avoid sharp dependency issues
 * and to speed up test execution since we're not testing image processing functionality.
 *
 * @returns Modified collections array with image resizing disabled for upload collections
 */
function getTestCollections(): CollectionConfig[] {
  return collections.map((collection) => {
    // Disable image resizing for upload collections in tests
    if (UPLOAD_COLLECTIONS.includes(collection.slug)) {
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
 * @param emailConfig Optional email configuration
 * @returns Payload configuration object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createBaseTestConfig(emailConfig?: any) {
  return buildConfig({
    admin: {
      user: Managers.slug,
      disable: true, // Disable admin UI in tests
    },
    collections: getTestCollections(),
    globals,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    typescript: {
      outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
    },
    // Use in-memory SQLite database for tests
    db: sqliteAdapter({
      client: {
        url: ':memory:', // In-memory SQLite database
      },
      push: true, // Auto-create schema
    }),
    jobs: {
      tasks,
      deleteJobOnComplete: true,
    },
    email:
      emailConfig ||
      nodemailerAdapter({
        defaultFromAddress: 'no-reply@test.com',
        defaultFromName: 'Test Suite',
        skipVerify: true,
        transportOptions: {
          // Use streamTransport to avoid Ethereal email logging
          streamTransport: true,
          newline: 'unix',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      }),
  })
}

/**
 * Performs cleanup operations for test environments
 * @param payload The Payload instance to cleanup
 */
async function cleanupTestEnvironment(payload: Payload): Promise<void> {
  // Close Payload connection and destroy in-memory database
  try {
    if (payload.db && typeof payload.db.destroy === 'function') {
      await payload.db.destroy()
    }
  } catch (_error) {
    // Failed to close Payload connection - not critical for in-memory DB
  }
  // Note: In-memory SQLite database is automatically destroyed when connection closes
}

/**
 * Creates an isolated test database and Payload instance for a test suite
 * Each call creates a unique in-memory SQLite database to ensure complete isolation
 */
export async function createTestEnvironment(): Promise<{
  payload: Payload
  cleanup: () => Promise<void>
  adminUser: Awaited<ReturnType<typeof testData.createManager>>
}> {
  // Creating test environment with in-memory SQLite database
  const config = createBaseTestConfig()
  const payload = await getPayload({ config })
  const adminUser = await testData.createManager(payload, {
    email: 'admin@example.com',
    type: 'admin' as const,
  })

  const cleanup = () => cleanupTestEnvironment(payload)

  return { payload, cleanup, adminUser }
}

/**
 * Creates an isolated test database and Payload instance with email support
 */
export async function createTestEnvironmentWithEmail(): Promise<{
  payload: Payload
  cleanup: () => Promise<void>
  emailAdapter: EmailTestAdapter
}> {
  // Creating test environment with email support and in-memory SQLite database

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
  const config = createBaseTestConfig(enhancedFn)
  const payload = await getPayload({ config })
  const cleanup = () => cleanupTestEnvironment(payload)

  return { payload, cleanup, emailAdapter }
}

/**
 * Creates an authenticated request for testing
 */
export async function createAuthenticatedRequest(
  payload: Payload,
  userId: string,
): Promise<PayloadRequest> {
  const user = await payload.findByID({
    collection: 'managers',
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
  timeout: number = DEFAULT_EMAIL_TIMEOUT,
): Promise<void> {
  await emailAdapter.waitForEmail(timeout)
}

/**
 * Creates a test user for use in tests
 * @param payload The Payload instance
 * @param overrides Optional field overrides
 */
export async function createTestUser(
  payload: Payload,
  overrides: Partial<Manager> = {},
): Promise<Manager> {
  const defaultData = {
    name: `Test User ${Date.now()}`,
    email: `test-user-${Date.now()}@example.com`,
    password: 'password123',
    type: 'admin' as const,
  }

  return await payload.create({
    collection: 'managers',
    data: { ...defaultData, ...overrides },
  })
}

/**
 * Creates a test client for API authentication tests
 * @param payload The Payload instance
 * @param managers Array of user IDs who can manage this client
 * @param primaryContact User ID of the primary contact
 * @param overrides Optional field overrides
 */
export async function createTestClient(
  payload: Payload,
  managers: number[],
  primaryContact: number,
  overrides: Partial<Client> = {},
): Promise<Client> {
  const defaultData = {
    name: `Test Client ${Date.now()}`,
    notes: 'Test client for automated testing',
    role: 'full-access' as const,
    managers,
    primaryContact,
    active: true,
  }

  return await payload.create({
    collection: 'clients',
    data: { ...defaultData, ...overrides },
  })
}

/**
 * Creates a test client with a manager user
 * @param payload The Payload instance
 * @param overrides Optional overrides for client or user
 */
export async function createTestClientWithManager(
  payload: Payload,
  overrides: {
    user?: Partial<Manager>
    client?: Partial<Client>
  } = {},
): Promise<{
  user: Manager
  client: Client
}> {
  // Create manager user
  const user = await createTestUser(payload, overrides.user)

  // Create client with this user as manager and primary contact
  const client = await createTestClient(payload, [user.id], user.id, overrides.client)

  return { user, client }
}

/**
 * Creates an authenticated request for a client (API key auth)
 * @param clientId The client ID
 * @param apiKey The API key for the client
 */
export function createClientAuthenticatedRequest(
  clientId: string,
  apiKey: string,
): Partial<PayloadRequest> {
  // Create a minimal request object for testing
  // The headers type in PayloadRequest is complex, so we use a type assertion
  const headers = new Headers()
  headers.set('authorization', `clients API-Key ${apiKey}`)

  return {
    headers: headers as PayloadRequest['headers'],
    user: {
      id: clientId,
      collection: 'clients' as const,
      active: true,
    } as unknown as PayloadRequest['user'],
  }
}
