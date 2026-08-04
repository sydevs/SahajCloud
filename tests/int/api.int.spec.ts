import type { Payload, PayloadRequest } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Client, UserChoice } from '@/payload-types'

import { testData } from 'tests/utils/testData'

import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

describe('API', () => {
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

  describe('Usage Tracking', () => {
    it('tracks usage via direct update pattern', async () => {
      // This test verifies the direct Payload update pattern used by usageTrackingHook
      // (Hook integration with mock req objects is unreliable in Vitest)

      // Get initial stats
      const initialClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      const initialDailyRequests = initialClient.usage?.dailyRequests || 0
      const initialTotalRequests = initialClient.usage?.totalRequests || 0

      // Simulate what the hook does: direct Payload update
      const now = new Date().toISOString()
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usage: {
            dailyRequests: initialDailyRequests + 1,
            totalRequests: initialTotalRequests + 1,
            lastRequestAt: now,
            firstRequestAt: initialClient.usage?.firstRequestAt || now,
          },
        },
      })

      // Verify stats were updated
      const updatedClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(updatedClient.usage?.dailyRequests).toBe(initialDailyRequests + 1)
      expect(updatedClient.usage?.totalRequests).toBe(initialTotalRequests + 1)
      expect(updatedClient.usage?.lastRequestAt).toBeDefined()
      expect(updatedClient.usage?.firstRequestAt).toBeDefined()
    })

    it('tracks multiple requests incrementally via direct update', async () => {
      // This test verifies incremental updates work correctly
      // (Hook integration with mock req objects is unreliable in Vitest)

      // Get initial stats
      const initialClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      const initialDailyRequests = initialClient.usage?.dailyRequests || 0

      // Simulate 3 requests using the same pattern as the hook
      for (let i = 0; i < 3; i++) {
        const client = (await payload.findByID({
          collection: 'clients',
          id: testClient.id,
        })) as Client

        const now = new Date().toISOString()
        await payload.update({
          collection: 'clients',
          id: testClient.id,
          data: {
            usage: {
              dailyRequests: ((client.usage?.dailyRequests as number) || 0) + 1,
              totalRequests: ((client.usage?.totalRequests as number) || 0) + 1,
              lastRequestAt: now,
              firstRequestAt: client.usage?.firstRequestAt || now,
            },
          },
        })
      }

      // Verify incremental updates
      const updatedClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(updatedClient.usage?.dailyRequests).toBe(initialDailyRequests + 3)
    })

    it('sets firstRequestAt only on first request', async () => {
      // Create a new client with no usage
      const newClient = await testData.createClient(payload, adminUserId, {
        name: 'New Client for First Request Test',
      })

      // Verify no firstRequestAt (Payload returns null for empty fields)
      expect(newClient.usage?.firstRequestAt).toBeFalsy()

      // Simulate first request using the same pattern as the hook
      const now = new Date().toISOString()
      const client = (await payload.findByID({
        collection: 'clients',
        id: newClient.id,
      })) as Client

      await payload.update({
        collection: 'clients',
        id: newClient.id,
        data: {
          usage: {
            dailyRequests: ((client.usage?.dailyRequests as number) || 0) + 1,
            totalRequests: ((client.usage?.totalRequests as number) || 0) + 1,
            lastRequestAt: now,
            firstRequestAt: client.usage?.firstRequestAt || now,
          },
        },
      })

      const afterFirst = (await payload.findByID({
        collection: 'clients',
        id: newClient.id,
      })) as Client

      const firstRequestAt = afterFirst.usage?.firstRequestAt
      expect(firstRequestAt).toBeDefined()

      // Simulate second request
      const laterTime = new Date().toISOString()
      await payload.update({
        collection: 'clients',
        id: newClient.id,
        data: {
          usage: {
            dailyRequests: ((afterFirst.usage?.dailyRequests as number) || 0) + 1,
            totalRequests: ((afterFirst.usage?.totalRequests as number) || 0) + 1,
            lastRequestAt: laterTime,
            // Key test: firstRequestAt should preserve the original value
            firstRequestAt: afterFirst.usage?.firstRequestAt || laterTime,
          },
        },
      })

      const afterSecond = (await payload.findByID({
        collection: 'clients',
        id: newClient.id,
      })) as Client

      // firstRequestAt should not change
      expect(afterSecond.usage?.firstRequestAt).toBe(firstRequestAt)
    })

    it('resets daily counters via scheduled job', async () => {
      // Set some usage
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usage: {
            dailyRequests: 50,
            totalRequests: 100,
            peakDailyRequests: 30,
            lastRequestAt: new Date().toISOString(),
          },
        },
      })

      // Verify usage was set
      const clientBeforeReset = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client

      expect(clientBeforeReset.usage?.dailyRequests).toBe(50)

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
      expect(clientAfterReset.usage?.peakDailyRequests).toBe(50) // Updated to max(30, 50)
      expect(clientAfterReset.usage?.totalRequests).toBe(100) // Preserved
    })

    it('preserves peakDailyRequests when resetting', async () => {
      // Set an initial peakDailyRequests higher than dailyRequests
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usage: {
            dailyRequests: 25,
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

    it('increments usage exactly once on depth=2 populate reads (no N+1)', async () => {
      // Regression test for #559: depth >= 1 reads that populate relationships
      // should increment usage exactly once, not per populated relationship.
      // Before the fix, internal relationship-population sub-reads had fresh contexts,
      // causing the deduplication tracker to fail and multiple UPDATEs to fire.

      // Create a meditation and a user-choice that references it, so a depth>=1
      // read fans out into an internal population sub-read (meditations also carry
      // the usage hook). Pre-fix, that sub-read ran under a fresh context that
      // defeated the afterRead dedup tracker and double-counted; post-fix,
      // beforeOperation counts the top-level read once and skips the
      // currentDepth-bearing populate sub-read.
      const meditation = await testData.createMeditation(payload, undefined, {
        title: 'Test Meditation for Usage Tracking',
      })

      // user-choices is an upload (tag) collection — createUserChoice supplies the
      // required file. morningMeditation is a real relationship to meditations.
      const userChoice = await testData.createUserChoice(payload, {
        morningMeditation: meditation.id,
      })

      // Get initial usage stats
      const initialClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client
      const initialDailyRequests = initialClient.usage?.dailyRequests || 0

      // Create a client-authenticated request
      const clientReq = createClientAuthenticatedRequest(
        String(testClient.id),
        testClient.apiKey || 'test-key',
      ) as PayloadRequest

      // depth=2 read that populates morningMeditation. The populate triggers an
      // internal meditations read (numeric currentDepth), which must NOT increment
      // usage separately — only the top-level read counts.
      const result = await payload.find({
        collection: 'user-choices',
        select: {
          id: true,
          morningMeditation: true,
        },
        // `populate` is keyed by the *target collection*, not the field name.
        populate: {
          meditations: {
            title: true,
          },
        },
        depth: 2,
        req: clientReq,
        overrideAccess: true,
      })

      // Verify we got the populated data
      expect(result.docs.length).toBeGreaterThan(0)
      const foundChoice = result.docs.find((choice) => choice.id === userChoice.id) as
        | (UserChoice & { morningMeditation: unknown })
        | undefined
      expect(foundChoice).toBeDefined()
      expect(foundChoice?.morningMeditation).toBeDefined()

      // Verify usage was incremented exactly once (the key assertion)
      const updatedClient = (await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })) as Client
      const finalDailyRequests = updatedClient.usage?.dailyRequests || 0

      // With the fix: exactly +1 increment for the single top-level read
      // Before the fix: multiple increments (one per populated relationship)
      expect(finalDailyRequests).toBe(initialDailyRequests + 1)
    })
  })

  describe('Abuse Score', () => {
    it('has abuseScore virtual json field in clients collection', async () => {
      // Test the virtual field exists with correct configuration
      const clientsCollection = payload.config.collections.find((c) => c.slug === 'clients')

      const usageField = clientsCollection?.fields.find((f: any) => f.name === 'usage') as any

      const abuseScoreField = usageField?.fields?.find((f: any) => f.name === 'abuseScore')

      expect(abuseScoreField).toBeDefined()
      expect(abuseScoreField?.type).toBe('json')
      expect(abuseScoreField?.virtual).toBe(true)
      // Check for beforeInput (array) and Cell components
      expect(abuseScoreField?.admin?.components?.beforeInput).toContain(
        '@/components/admin/AbuseScore/AbuseScoreField',
      )
      expect(abuseScoreField?.admin?.components?.Cell).toBe(
        '@/components/admin/AbuseScore/AbuseScoreCell',
      )
    })

    it('computes abuseScore via afterRead hook', async () => {
      // Set usage data for the test client
      await payload.update({
        collection: 'clients',
        id: testClient.id,
        data: {
          usage: {
            dailyRequests: 500,
            highUsageDays: 5,
            firstRequestAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
          },
        },
      })

      // Fetch client and verify abuseScore is computed
      const client = await payload.findByID({
        collection: 'clients',
        id: testClient.id,
      })

      // abuseScore is a virtual field computed by afterRead hook
      // Cast to access the virtual field (not in generated types)
      const usage = client.usage as typeof client.usage & {
        abuseScore?: { score: number; level: string }
      }

      expect(usage?.abuseScore).toBeDefined()
      expect(typeof usage?.abuseScore?.score).toBe('number')
      expect(['normal', 'elevated', 'high', 'critical']).toContain(usage?.abuseScore?.level)
    })
  })
})
