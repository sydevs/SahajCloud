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

  describe('ensureClientId', () => {
    it('auto-populates a UUID clientId on create when absent', async () => {
      const client = await testData.createClient(payload, adminUserId, {
        name: 'Client Without clientId',
      })

      expect(client.clientId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })

    it('preserves an explicitly-provided clientId on create (e.g. Atlas key)', async () => {
      const client = await testData.createClient(payload, adminUserId, {
        name: 'Client With Atlas clientId',
        clientId: 'atlas-supplied-key',
      })

      expect(client.clientId).toBe('atlas-supplied-key')
    })

    it('never overwrites clientId on update', async () => {
      const client = await testData.createClient(payload, adminUserId, {
        name: 'Client clientId Stability',
      })
      const original = client.clientId
      expect(original).toBeTruthy()

      const updated = (await payload.update({
        collection: 'clients',
        id: client.id,
        data: { name: 'Renamed Client' },
      })) as Client

      expect(updated.clientId).toBe(original)
    })
  })

  describe('primaryContact conditional requirement', () => {
    it('allows a single-manager client with no primaryContact', async () => {
      const solo = await testData.createManager(payload, {
        name: 'Solo Manager',
        type: 'admin' as const,
      })

      // The primaryContact field is hidden (condition false) for a single
      // manager, so its `required` is skipped — creating without it succeeds.
      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'Single-manager client',
          managers: [solo.id],
          roles: ['wemeditate-web-client'],
        },
      })) as Client

      expect(client.id).toBeDefined()
      expect(client.primaryContact ?? null).toBeNull()
    })

    it('requires primaryContact when more than one manager is assigned', async () => {
      const m1 = await testData.createManager(payload, { name: 'Mgr One', type: 'admin' as const })
      const m2 = await testData.createManager(payload, { name: 'Mgr Two', type: 'admin' as const })

      await expect(
        payload.create({
          collection: 'clients',
          data: {
            name: 'Multi-manager client without contact',
            managers: [m1.id, m2.id],
            roles: ['wemeditate-web-client'],
          },
        }),
      ).rejects.toThrow()
    })
  })

  // Note: checkHighUsageAlert hook was removed and moved to usagePlugin.
  // High usage alerts are now handled by the trackUsage task handler.
})
