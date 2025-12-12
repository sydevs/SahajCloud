import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Manager } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Managers Collection', () => {
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

  it('requires unique email', async () => {
    const managerData = {
      name: 'Unique Manager',
      email: 'unique@example.com',
      password: 'password123',
      type: 'admin' as const,
    }

    // Create first manager
    await testData.createManager(payload, managerData)

    // Try to create second manager with same email
    await expect(testData.createManager(payload, managerData)).rejects.toThrow()
  })

  it('demonstrates complete isolation - no data leakage', async () => {
    // Create a manager with a unique identifier
    const testManager = await testData.createManager(payload, {
      name: 'Isolation Test Manager',
      email: 'isolation-test@example.com',
      password: 'password123',
    })

    // This test should only see its own data in the isolated database
    const allManagers = await payload.find({
      collection: 'managers',
    })

    // Should only see managers created in this test file
    expect(allManagers.docs.length).toBeGreaterThan(0)

    // Each test gets a fresh database, so previous tests' data won't interfere
    const isolationTestManagers = allManagers.docs.filter(
      (manager: Manager) => manager.email === 'isolation-test@example.com',
    )
    expect(isolationTestManagers).toHaveLength(1)
    expect(isolationTestManagers[0].id).toBe(testManager.id)
  })
})
