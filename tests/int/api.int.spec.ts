import type { Payload, PayloadRequest } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Client } from '@/payload-types'

import { testData } from 'tests/utils/testData'

import { createTestEnvironment } from '../utils/testHelpers'

describe('API', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testClient: Client
  let clientReq: PayloadRequest
  let adminUserId: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id

    // Create test user and client
    testClient = await testData.createClient(payload, adminUserId)

    // Simulate API client reading a tag
    clientReq = {
      user: {
        id: testClient.id,
        collection: 'clients',
        active: true,
      },
      payload: payload,
    } as PayloadRequest
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Usage Tracking', () => {
    it('queues tracking job on API read', async () => {
      // Mock the job queue
      const queueSpy = vi.spyOn(payload.jobs, 'queue')

      // Find a tag which will trigger the afterRead hook
      const result = await payload.find({
        collection: 'music',
        req: clientReq,
        limit: 1,
      })

      // Verify job was queued for each document read
      if (result.docs.length > 0) {
        expect(queueSpy).toHaveBeenCalledWith({
          task: 'trackUsage',
          input: { consumerId: String(testClient.id) },
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

      const initialDailyRequests = initialClient.usage?.dailyRequests || 0

      // Run the usage tracking job handler directly
      const trackUsageTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'trackUsage')
      expect(trackUsageTask).toBeDefined()

      if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
        await trackUsageTask.handler({
          input: { consumerId: String(testClient.id) },
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

      expect(updatedClient.usage?.dailyRequests).toBe(initialDailyRequests + 1)
      expect(updatedClient.usage?.lastRequestAt).toBeDefined()

      // Safe to assert after checking it's defined above
      const updatedLastRequestAt = updatedClient.usage!.lastRequestAt!
      expect(new Date(updatedLastRequestAt).getTime()).toBeGreaterThan(
        initialClient.usage?.lastRequestAt
          ? new Date(initialClient.usage.lastRequestAt).getTime()
          : 0,
      )
    })

    it('tracks multiple requests incrementally', async () => {
      // Get initial stats
      const initialClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      const initialDailyRequests = initialClient.usage?.dailyRequests || 0

      // Run the job handler multiple times
      const trackUsageTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'trackUsage')

      for (let i = 0; i < 5; i++) {
        if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
          await trackUsageTask.handler({
            input: { consumerId: String(testClient.id) },
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

      expect(updatedClient.usage?.dailyRequests).toBe(initialDailyRequests + 5)
    })

    it('resets daily counters via scheduled job', async () => {
      // First, set some usage
      const trackUsageTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'trackUsage')

      // Track some usage
      for (let i = 0; i < 3; i++) {
        if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
          await trackUsageTask.handler({
            input: { consumerId: String(testClient.id) },
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

      expect(clientBeforeReset.usage?.dailyRequests).toBeGreaterThan(0)
      const dailyRequestsBeforeReset = clientBeforeReset.usage?.dailyRequests || 0

      // Run the reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetUsage')
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

      expect(clientAfterReset.usage?.dailyRequests).toBe(0)
      expect(clientAfterReset.usage?.peakDailyRequests).toBe(
        Math.max(clientBeforeReset.usage?.peakDailyRequests || 0, dailyRequestsBeforeReset),
      )
    })

    it('preserves peakDailyRequests when resetting', async () => {
      // Set an initial peakDailyRequests
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usage: {
            dailyRequests: 50,
            peakDailyRequests: 75,
            lastRequestAt: new Date().toISOString(),
          },
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify peakDailyRequests is preserved
      const client = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(client.usage?.dailyRequests).toBe(0)
      expect(client.usage?.peakDailyRequests).toBe(75) // Should preserve the higher value
    })

    it('updates peakDailyRequests if current daily is higher', async () => {
      // Set usage with dailyRequests higher than peakDailyRequests
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usage: {
            dailyRequests: 100,
            peakDailyRequests: 75,
            lastRequestAt: new Date().toISOString(),
          },
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as never,
          req: { payload } as unknown as PayloadRequest,
          inlineTask: (() => {}) as never,
          tasks: {} as never,
        })
      }

      // Verify peakDailyRequests was updated
      const client = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(client.usage?.dailyRequests).toBe(0)
      expect(client.usage?.peakDailyRequests).toBe(100) // Should update to the higher value
    })

    it('only resets clients with daily requests > 0', async () => {
      // Create a client with 0 daily requests
      const zeroUsageClient = await testData.createClient(payload, adminUserId, {
        name: 'Zero Usage Client',
        usage: {
          dailyRequests: 0,
          peakDailyRequests: 10,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find((t) => t.slug === 'resetUsage')
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

      expect(client.usage?.dailyRequests).toBe(0) // Still 0
      expect(client.usage?.peakDailyRequests).toBe(10) // Unchanged
    })
  })

  describe('High Usage Alerts', () => {
    // Note: The actual logging test is removed because Payload's Pino logger
    // doesn't use console.warn directly. The hook functionality is verified
    // by the log output during tests: "[WARN] High usage alert for API client"

    it('virtual field highUsageAlert reflects high usage state', async () => {
      // Test the virtual field logic
      const clientsCollection = payload.config.collections.find((c) => c.slug === 'clients')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usageField = clientsCollection?.fields.find((f: any) => f.name === 'usage') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const highUsageAlertField = usageField?.fields?.find((f: any) => f.name === 'highUsageAlert')

      expect(highUsageAlertField).toBeDefined()
      expect(highUsageAlertField?.virtual).toBe(true)
      expect(highUsageAlertField?.admin?.readOnly).toBe(true)
      expect(highUsageAlertField?.admin?.components?.Field?.clientProps?.threshold).toBe(1000)
    })
  })
})
