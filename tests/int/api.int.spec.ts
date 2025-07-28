import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'

describe('API', () => {
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

  it('fetches users', async () => {
    // Create a test user first
    await payload.create({
      collection: 'users',
      data: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      },
    })

    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
    expect(users.docs).toHaveLength(1)
    expect(users.docs[0].email).toBe('test@example.com')
  })
})
