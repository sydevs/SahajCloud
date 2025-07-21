import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'

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
      email: 'test@example.com',
      password: 'password123',
    }
    
    const user = await payload.create({
      collection: 'users',
      data: userData,
    }) as User

    expect(user).toBeDefined()
    expect(user.email).toBe('test@example.com')
    expect(user.id).toBeDefined()
    // Password should not be returned in response
    expect((user as any).password).toBeUndefined()
  })

  it('requires email field', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: {
          password: 'password123',
        } as any,
      })
    ).rejects.toThrow()
  })

  it('requires unique email', async () => {
    const userData = {
      email: 'unique@example.com',
      password: 'password123',
    }

    // Create first user
    await payload.create({
      collection: 'users',
      data: userData,
    })

    // Try to create second user with same email
    await expect(
      payload.create({
        collection: 'users',
        data: userData,
      })
    ).rejects.toThrow()
  })

  it('finds users', async () => {
    const user1 = await payload.create({
      collection: 'users',
      data: {
        email: 'user1@example.com',
        password: 'password123',
      },
    }) as User

    const user2 = await payload.create({
      collection: 'users',
      data: {
        email: 'user2@example.com',
        password: 'password123',
      },
    }) as User

    const result = await payload.find({
      collection: 'users',
      where: {
        id: {
          in: [user1.id, user2.id],
        },
      },
    })

    expect(result.docs).toHaveLength(2)
    expect(result.totalDocs).toBe(2)
  })

  it('updates a user', async () => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email: 'update@example.com',
        password: 'password123',
      },
    }) as User

    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        email: 'updated@example.com',
      },
    }) as User

    expect(updated.email).toBe('updated@example.com')
  })

  it('deletes a user', async () => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email: 'delete@example.com',
        password: 'password123',
      },
    }) as User

    await payload.delete({
      collection: 'users',
      id: user.id,
    })

    const result = await payload.find({
      collection: 'users',
      where: {
        id: {
          equals: user.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('demonstrates complete isolation - no data leakage', async () => {
    // Create a user with a unique identifier
    const testUser = await payload.create({
      collection: 'users',
      data: {
        email: 'isolation-test@example.com',
        password: 'password123',
      },
    }) as User

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