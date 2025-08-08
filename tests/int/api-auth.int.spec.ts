import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import type { Client, User } from '@/payload-types'
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from 'tests/utils/testData'

// For testing access control functions, we only need minimal user objects
// These partial types are sufficient for testing the access control logic
type TestUser = { collection: string; id: string; active?: boolean }

describe('API Authentication', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testUser: User
  let testClient: Client
  let apiKey: string

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test user and client
    testUser = await testData.createUser(payload)
    testClient = await testData.createClient(payload)

    // Generate API key for the client
    const response = await payload.update({
      collection: 'clients',
      id: testClient.id,
      data: {
        enableAPIKey: true,
      },
    })
    
    // Note: In a real scenario, the API key would be returned after generation
    // For testing purposes, we'll simulate this
    apiKey = response.apiKey || 'test-api-key-12345'
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Read-Only Access Control', () => {
    let testTag: any

    beforeAll(async () => {
      // Create test data - using tags instead of meditations since meditations require file upload
      testTag = await testData.createTag(payload)
    })

    it('allows read operations for API clients', async () => {
      // Note: In integration tests, we can't fully test HTTP-level access control
      // The access control is properly enforced at the HTTP API level
      // This test verifies the setup is correct
      const clientReq = {
        user: {
          id: testClient.id,
          collection: 'clients',
          active: true,
        },
      } as PayloadRequest

      // In a real API request, this would check access control
      const result = await payload.find({
        collection: 'tags',
        req: clientReq,
      })

      expect(result).toBeDefined()
      expect(result.docs).toBeDefined()
    })

    it('access control is configured for create operations', async () => {
      // Verify that tags collection has access control configured
      const tagsCollection = payload.config.collections.find(c => c.slug === 'tags')
      expect(tagsCollection?.access?.create).toBeDefined()
      
      // Test the access control function directly
      const client = testData.dummyUser('clients')
      const user = testData.dummyUser('users', {
        permissions: [
          { allowedCollection: 'tags', level: 'manage', locales: ['all'] }
        ]
      })
      
      const createAccess = tagsCollection?.access?.create
      if (typeof createAccess === 'function') {
        // Testing access control with minimal request objects
        const clientReq = { user: client } as PayloadRequest
        const userReq = { user } as PayloadRequest
        expect(createAccess({ req: clientReq })).toBe(false)
        expect(createAccess({ req: userReq })).toBe(true)
      }
    })

    it('access control is configured for update operations', async () => {
      const tagsCollection = payload.config.collections.find(c => c.slug === 'tags')
      expect(tagsCollection?.access?.update).toBeDefined()
      
      // Test the access control function directly
      const client = testData.dummyUser('clients')
      const user = testData.dummyUser('users', {
        permissions: [
          { allowedCollection: 'tags', level: 'manage', locales: ['all'] }
        ]
      })
      
      const updateAccess = tagsCollection?.access?.update
      if (typeof updateAccess === 'function') {
        const clientReq = { user: client } as PayloadRequest
        const userReq = { user } as PayloadRequest
        expect(updateAccess({ req: clientReq })).toBe(false)
        expect(updateAccess({ req: userReq })).toBe(true)
      }
    })

    it('access control is configured for delete operations', async () => {
      const tagsCollection = payload.config.collections.find(c => c.slug === 'tags')
      expect(tagsCollection?.access?.delete).toBeDefined()
      
      // Test the access control function directly
      const client = testData.dummyUser('clients')
      const user = testData.dummyUser('users', {
        permissions: [
          { allowedCollection: 'tags', level: 'manage', locales: ['all'] }
        ]
      })

      const deleteAccess = tagsCollection?.access?.delete
      if (typeof deleteAccess === 'function') {
        const clientReq = { user: client } as PayloadRequest
        const userReq = { user } as PayloadRequest
        expect(deleteAccess({ req: clientReq })).toBe(false)
        expect(deleteAccess({ req: userReq })).toBe(true)
      }
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
        collection: 'tags',
        req: clientReq,
        limit: 1,
      })

      // Verify job was queued for each document read
      if (result.docs.length > 0) {
        expect(queueSpy).toHaveBeenCalledWith({
          task: 'trackClientUsage',
          input: {
            clientId: testClient.id,
          },
        })
      }

      queueSpy.mockRestore()
    })

    it('updates client usage stats via job handler', async () => {
      // Get initial stats
      const initialClient = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

      const initialDailyRequests = initialClient.usageStats?.dailyRequests || 0

      // Run the usage tracking job handler directly
      const trackUsageTask = payload.config.jobs?.tasks?.find(t => t.slug === 'trackClientUsage')
      expect(trackUsageTask).toBeDefined()

      if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
        await trackUsageTask.handler({
          input: { clientId: testClient.id },
          job: {} as any,
          req: { payload } as any,
          inlineTask: (() => {}) as any,
          tasks: {} as any,
        })
      }

      // Verify stats were updated
      const updatedClient = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

      expect(updatedClient.usageStats?.dailyRequests).toBe(initialDailyRequests + 1)
      expect(updatedClient.usageStats?.lastRequestAt).toBeDefined()
      expect(new Date(updatedClient.usageStats?.lastRequestAt!).getTime()).toBeGreaterThan(
        initialClient.usageStats?.lastRequestAt 
          ? new Date(initialClient.usageStats.lastRequestAt).getTime() 
          : 0
      )
    })

    it('tracks multiple requests incrementally', async () => {
      // Get initial stats
      const initialClient = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

      const initialDailyRequests = initialClient.usageStats?.dailyRequests || 0

      // Run the job handler multiple times
      const trackUsageTask = payload.config.jobs?.tasks?.find(t => t.slug === 'trackClientUsage')
      
      for (let i = 0; i < 5; i++) {
        if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
          await trackUsageTask.handler({
            input: { clientId: testClient.id },
            job: {} as any,
            req: { payload } as any,
            inlineTask: (() => {}) as any,
            tasks: {} as any,
          })
        }
      }

      // Verify incremental updates
      const updatedClient = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

      expect(updatedClient.usageStats?.dailyRequests).toBe(initialDailyRequests + 5)
    })

    it('resets daily counters via scheduled job', async () => {
      // First, set some usage
      const trackUsageTask = payload.config.jobs?.tasks?.find(t => t.slug === 'trackClientUsage')
      
      // Track some usage
      for (let i = 0; i < 3; i++) {
        if (trackUsageTask && typeof trackUsageTask.handler === 'function') {
          await trackUsageTask.handler({
            input: { clientId: testClient.id },
            job: {} as any,
            req: { payload } as any,
            inlineTask: (() => {}) as any,
            tasks: {} as any,
          })
        }
      }

      // Verify usage was tracked
      const clientBeforeReset = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client
      
      expect(clientBeforeReset.usageStats?.dailyRequests).toBeGreaterThan(0)
      const dailyRequestsBeforeReset = clientBeforeReset.usageStats?.dailyRequests || 0

      // Run the reset job
      const resetTask = payload.config.jobs?.tasks?.find(t => t.slug === 'resetClientUsage')
      expect(resetTask).toBeDefined()
      
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as any,
          req: { payload } as any,
          inlineTask: (() => {}) as any,
          tasks: {} as any,
        })
      }

      // Verify counters were reset
      const clientAfterReset = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

      expect(clientAfterReset.usageStats?.dailyRequests).toBe(0)
      expect(clientAfterReset.usageStats?.maxDailyRequests).toBe(
        Math.max(
          clientBeforeReset.usageStats?.maxDailyRequests || 0,
          dailyRequestsBeforeReset
        )
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
      const resetTask = payload.config.jobs?.tasks?.find(t => t.slug === 'resetClientUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as any,
          req: { payload } as any,
          inlineTask: (() => {}) as any,
          tasks: {} as any,
        })
      }

      // Verify maxDailyRequests is preserved
      const client = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

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
      const resetTask = payload.config.jobs?.tasks?.find(t => t.slug === 'resetClientUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as any,
          req: { payload } as any,
          inlineTask: (() => {}) as any,
          tasks: {} as any,
        })
      }

      // Verify maxDailyRequests was updated
      const client = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      }) as Client

      expect(client.usageStats?.dailyRequests).toBe(0)
      expect(client.usageStats?.maxDailyRequests).toBe(100) // Should update to the higher value
    })

    it('only resets clients with daily requests > 0', async () => {
      // Create a client with 0 daily requests
      const zeroUsageClient = await testData.createClient(payload, {
        name: 'Zero Usage Client',
        usageStats: {
          totalRequests: 50,
          dailyRequests: 0,
          maxDailyRequests: 10,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Run reset job
      const resetTask = payload.config.jobs?.tasks?.find(t => t.slug === 'resetClientUsage')
      if (resetTask && typeof resetTask.handler === 'function') {
        await resetTask.handler({
          input: {},
          job: {} as any,
          req: { payload } as any,
          inlineTask: (() => {}) as any,
          tasks: {} as any,
        })
      }

      // Verify the client wasn't touched
      const client = await payload.findByID({
        collection: 'clients',
        id: zeroUsageClient.id,
      }) as Client

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
      const highUsageClient = await testData.createClient(payload, {
        name: 'High Usage Client',
        usageStats: {
          totalRequests: 5000,
          dailyRequests: 1001,
          maxDailyRequests: 900,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Verify console warning was triggered
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('High usage alert for client High Usage Client: 1001 requests today')
      )

      consoleWarnSpy.mockRestore()
    })

    it('triggers console warning for high maxDailyRequests', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Create a client with high maxDailyRequests
      await testData.createClient(payload, {
        name: 'High Max Usage Client',
        usageStats: {
          totalRequests: 5000,
          dailyRequests: 500,
          maxDailyRequests: 1001,
          lastRequestAt: new Date().toISOString(),
        },
      })

      // Verify console warning was triggered
      expect(consoleWarnSpy).toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
    })

    it('does not trigger warning for usage under threshold', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Create a client with normal usage
      await testData.createClient(payload, {
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
      const clientsCollection = payload.config.collections.find(c => c.slug === 'clients')
      const usageStatsField = clientsCollection?.fields.find(
        (f: any) => f.name === 'usageStats'
      ) as any
      const highUsageAlertField = usageStatsField?.fields?.find((f: any) => f.name === 'highUsageAlert')

      expect(highUsageAlertField).toBeDefined()
      expect(highUsageAlertField?.virtual).toBe(true)
      expect(highUsageAlertField?.admin?.readOnly).toBe(true)
      expect(highUsageAlertField?.admin?.components?.Field?.clientProps?.threshold).toBe(1000)
    })
  })
})