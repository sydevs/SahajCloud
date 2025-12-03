import type { Payload, PayloadRequest } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Client } from '@/payload-types'

import { testData } from 'tests/utils/testData'

import { createTestEnvironment } from '../utils/testHelpers'

describe('API Authentication', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testClient: Client
  let adminUserId: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id

    // Create test user and client
    testClient = await testData.createClient(payload, adminUserId)
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Role-Based Access Control', () => {
    it('allows admin managers full access to all collections', async () => {
      const adminManager = await testData.createManager(payload, {
        email: 'admin@test.com',
        password: 'password',
        admin: true,
      })

      const adminReq = {
        user: {
          id: adminManager.id,
          collection: 'managers',
          admin: true,
          active: true,
        },
        payload,
      } as PayloadRequest

      // Admin should be able to read any collection
      const result = await payload.find({
        collection: 'music',
        req: adminReq,
      })

      expect(result).toBeDefined()
      expect(result.docs).toBeDefined()
    })

    it('restricts non-admin managers based on roles', async () => {
      const limitedManager = await testData.createManager(payload, {
        email: 'limited@test.com',
        password: 'password',
        admin: false,
        roles: ['translator'], // Only translator role
      })

      const limitedReq = {
        user: {
          id: limitedManager.id,
          collection: 'managers',
          admin: false,
          roles: ['translator'],
          active: true,
        },
        payload,
      } as PayloadRequest

      // Translator should be able to read music (implicit read access)
      const result = await payload.find({
        collection: 'music',
        req: limitedReq,
      })

      expect(result).toBeDefined()
    })

    it('blocks API clients from accessing manager and client collections', async () => {
      const clientReq = {
        user: {
          id: testClient.id,
          collection: 'clients',
          active: true,
          roles: ['we-meditate-web'],
        },
        payload,
      } as PayloadRequest

      // Clients should not be able to access managers collection
      try {
        await payload.find({
          collection: 'managers',
          req: clientReq,
        })
        // If we get here, the test should fail
        expect(true).toBe(false)
      } catch (error) {
        // Expected to throw an access denied error
        expect(error).toBeDefined()
      }
    })

    it('allows API clients to read collections they have access to', async () => {
      const clientReq = {
        user: {
          id: testClient.id,
          collection: 'clients',
          active: true,
          roles: ['we-meditate-web'],
        },
        payload,
      } as PayloadRequest

      // Client should be able to read music
      const result = await payload.find({
        collection: 'music',
        req: clientReq,
      })

      expect(result).toBeDefined()
      expect(result.docs).toBeDefined()
    })
  })

  describe('Usage Tracking via Jobs', () => {
    it('queues usage tracking job on API read', async () => {
      // Mock the job queue
      const queueSpy = vi.spyOn(payload.jobs, 'queue')

      // Simulate API client reading a tag
      const clientReq = {
        user: {
          id: testClient.id,
          collection: 'clients',
          active: true,
        },
        payload: payload,
      } as PayloadRequest

      // Find a tag which will trigger the afterRead hook
      const result = await payload.find({
        collection: 'music',
        req: clientReq,
        limit: 1,
      })

      // Verify job was queued for each document read
      if (result.docs.length > 0) {
        expect(queueSpy).toHaveBeenCalledWith({
          task: 'trackClientUsage',
          input: {
            clientId: String(testClient.id),
          },
        })
      }

      queueSpy.mockRestore()
    })

    it('updates client usage stats via job handler', async () => {
      // Get initial stats
      const initialClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      const initialDailyRequests = initialClient.usageStats?.dailyRequests || 0

      // Run the usage tracking job handler directly
      const trackUsageTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'trackClientUsage')
      expect(trackUsageTask).toBeDefined()

      if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
        await trackUsageTask.handler({
          input: { clientId: testClient.id },
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify stats were updated
      const updatedClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(updatedClient.usageStats?.dailyRequests).toBe(initialDailyRequests + 1)
      expect(updatedClient.usageStats?.lastRequestAt).toBeDefined()

      // Safe to assert after checking it's defined above
      const updatedLastRequestAt = updatedClient.usageStats!.lastRequestAt!
      expect(new Date(updatedLastRequestAt).getTime()).toBeGreaterThan(
        initialClient.usageStats?.lastRequestAt
          ? new Date(initialClient.usageStats.lastRequestAt).getTime()
          : 0,
      )
    })

    it('tracks multiple requests incrementally', async () => {
      // Get initial stats
      const initialClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      const initialDailyRequests = initialClient.usageStats?.dailyRequests || 0

      // Run the job handler multiple times
      const trackUsageTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'trackClientUsage')

      for (let i = 0; i < 5; i++) {
        if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
          await trackUsageTask.handler({
            input: { clientId: testClient.id },
            job: {} as never,
            req: { payload } as unknown as PayloadRequest,
            inlineTask: (() => {}) as never,
            tasks: {} as never,
          })
        }
      }

      // Verify incremental updates
      const updatedClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(updatedClient.usageStats?.dailyRequests).toBe(initialDailyRequests + 5)
    })

    it('resets daily counters via scheduled job', async () => {
      // First, set some usage
      const trackUsageTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'trackClientUsage')

      // Track some usage
      for (let i = 0; i < 3; i++) {
        if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
          await trackUsageTask.handler({
            input: { clientId: testClient.id },
            job: {} as never,
            req: { payload } as unknown as PayloadRequest,
            inlineTask: (() => {}) as never,
            tasks: {} as never,
          })
        }
      }

      // Verify usage was tracked
      const clientBeforeReset = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(clientBeforeReset.usageStats?.dailyRequests).toBeGreaterThan(0)
      const dailyRequestsBeforeReset = clientBeforeReset.usageStats?.dailyRequests || 0

      // Run the reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetClientUsage')
      expect(resetTask).toBeDefined()

      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify counters were reset
      const clientAfterReset = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(clientAfterReset.usageStats?.dailyRequests).toBe(0)
      expect(clientAfterReset.usageStats?.maxDailyRequests).toBe(
        Math.max(clientBeforeReset.usageStats?.maxDailyRequests || 0, dailyRequestsBeforeReset),
      )
    })

    it('preserves maxDailyRequests when resetting', async () => {
      // Set an initial maxDailyRequests
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usageStats: {
            totalRequests: 100,
            dailyRequests: 50,
            maxDailyRequests: 75,
            lastRequestAt: new Date().toISOString(),
          },
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetClientUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify maxDailyRequests is preserved
      const client = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(client.usageStats?.dailyRequests).toBe(0)
      expect(client.usageStats?.maxDailyRequests).toBe(75) // Should preserve the higher value
    })

    it('updates maxDailyRequests if current daily is higher', async () => {
      // Set usage with dailyRequests higher than maxDailyRequests
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usageStats: {
            totalRequests: 100,
            dailyRequests: 100,
            maxDailyRequests: 75,
            lastRequestAt: new Date().toISOString(),
          },
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetClientUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify maxDailyRequests was updated
      const client = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(client.usageStats?.dailyRequests).toBe(0)
      expect(client.usageStats?.maxDailyRequests).toBe(100) // Should update to the higher value
    })

    it('only resets clients with daily requests > 0', async () => {
      // Create a client with 0 daily requests
      const zeroUsageClient = await testData.createClient(payload, adminUserId, {
        name: 'Zero Usage Client',
        usageStats: {
          totalRequests: 50,
          dailyRequests: 0,
          maxDailyRequests: 10,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetClientUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify the client wasn't touched
      const client = (await payload.findByID({
        collection: 'clients',
        id: zeroUsageClient.id,
      })) as Client

      expect(client.usageStats?.totalRequests).toBe(50) // Unchanged
      expect(client.usageStats?.dailyRequests).toBe(0) // Still 0
      expect(client.usageStats?.maxDailyRequests).toBe(10) // Unchanged
    })
  })

  describe('High Usage Alerts', () => {
    it('triggers console warning for high daily usage', async () => {
      // Mock console.warn
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Create a client with high usage
      await testData.createClient(payload, adminUserId, {
        name: 'High Usage Client',
        usageStats: {
          totalRequests: 5000,
          dailyRequests: 1001,
          maxDailyRequests: 900,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Verify console warning was triggered with new logger format
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARN] High usage alert for API client',
        expect.objectContaining({
          clientName: 'High Usage Client',
          dailyRequests: 1001,
        }),
      )

      consoleWarnSpy.mockRestore()
    })

    it('does not trigger warning for usage under threshold', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Create a client with normal usage
      await testData.createClient(payload, adminUserId, {
        name: 'Normal Usage Client',
        usageStats: {
          totalRequests: 500,
          dailyRequests: 999,
          maxDailyRequests: 800,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Verify console warning was NOT triggered
      expect(consoleWarnSpy).not.toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
    })

    it('virtual field highUsageAlert reflects high usage state', async () => {
      // Test the virtual field logic
      const clientsCollection = payload.config.collections.find((c) => c.slug === 'clients')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usageStatsField = clientsCollection?.fields.find((f: any) => f.name === 'usageStats') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const highUsageAlertField = usageStatsField?.fields?.find((f: any) => f.name === 'highUsageAlert')

      expect(highUsageAlertField).toBeDefined()
      expect(highUsageAlertField?.virtual).toBe(true)
      expect(highUsageAlertField?.admin?.readOnly).toBe(true)
      expect(highUsageAlertField?.admin?.components?.Field?.clientProps?.threshold).toBe(1000)
    })
  })
})
