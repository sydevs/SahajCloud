import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Client } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Client Hooks', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('validateClientData', () => {
    it('adds primaryContact to managers array if missing', async () => {
      // Create two managers
      const manager1 = await testData.createManager(payload, {
        name: 'Manager 1',
        type: 'admin' as const,
      })
      const manager2 = await testData.createManager(payload, {
        name: 'Manager 2',
        type: 'admin' as const,
      })

      // Create client with primaryContact not in managers list
      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'Test Client',
          managers: [manager1.id], // Only manager1
          primaryContact: manager2.id, // manager2 not in list
          roles: ['wemeditate-web-client'],
        },
      })) as Client

      // primaryContact should have been added to managers
      const managerIds = client.managers?.map((m) => (typeof m === 'object' ? m.id : m))
      expect(managerIds).toContain(manager2.id)
      expect(managerIds).toContain(manager1.id)
    })

    it('initializes usage stats on create', async () => {
      const client = await testData.createClient(payload, adminUserId)

      expect(client.usage).toBeDefined()
      expect(client.usage?.dailyRequests).toBe(0)
      expect(client.usage?.peakDailyRequests).toBe(0)
      expect(client.usage?.lastRequestAt).toBeNull()
    })

    it('preserves existing usage stats on update', async () => {
      const client = await testData.createClient(payload, adminUserId, {
        name: 'Usage Stats Client',
        usage: {
          dailyRequests: 50,
          peakDailyRequests: 75,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Update the client name
      const updated = (await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          name: 'Updated Client Name',
        },
      })) as Client

      // usage should be preserved
      expect(updated.usage?.dailyRequests).toBe(50)
      expect(updated.usage?.peakDailyRequests).toBe(75)
    })
  })

  // Note: checkHighUsageAlert hook was removed and moved to usagePlugin.
  // High usage alerts are now handled by the trackUsage task handler.
})
