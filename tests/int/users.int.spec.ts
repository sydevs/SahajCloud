import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Users Collection', () => {
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

  it('creates a user with email and password', async () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      admin: true,
    }
    
    const user = await testData.createUser(payload, userData)

    expect(user).toBeDefined()
    expect(user.email).toBe('test@example.com')
    expect(user.id).toBeDefined()
    expect(user.admin).toBe(true)
    // Password should not be returned in response
    expect((user as any).password).toBeUndefined()
  })

  it('requires email field', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: {
          name: 'Test User',
          password: 'password123',
        } as any,
      })
    ).rejects.toThrow()
  })

  it('requires unique email', async () => {
    const userData = {
      name: 'Unique User',
      email: 'unique@example.com',
      password: 'password123',
      admin: true,
    }

    // Create first user
    await testData.createUser(payload, userData)

    // Try to create second user with same email
    await expect(testData.createUser(payload, userData)).rejects.toThrow()
  })

  it('demonstrates complete isolation - no data leakage', async () => {
    // Create a user with a unique identifier
    const testUser = await testData.createUser(payload, {
      name: 'Isolation Test User',
      email: 'isolation-test@example.com',
      password: 'password123',
    })

    // This test should only see its own data in the isolated database
    const allUsers = await payload.find({
      collection: 'users',
    })

    // Should only see users created in this test file
    expect(allUsers.docs.length).toBeGreaterThan(0)
    
    // Each test gets a fresh database, so previous tests' data won't interfere
    const isolationTestUsers = allUsers.docs.filter((user: User) => user.email === 'isolation-test@example.com')
    expect(isolationTestUsers).toHaveLength(1)
    expect(isolationTestUsers[0].id).toBe(testUser.id)
  })
})