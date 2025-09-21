import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Client, Manager } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Clients Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testUser: Manager
  let testUser2: Manager

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test users
    testUser = await testData.createManager(payload, {
      name: 'Client Manager',
      email: 'client-manager@example.com',
      password: 'password123',
    })

    testUser2 = await testData.createManager(payload, {
      name: 'Client Manager 2',
      email: 'client-manager2@example.com',
      password: 'password123',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('CRUD Operations', () => {
    it('creates a client with all required fields', async () => {
      const client = await testData.createClient(payload, {
        name: 'Test Client App',
        notes: 'A test client application',
        managers: [testUser.id, testUser2.id],
        primaryContact: testUser.id,
      })

      expect(client).toBeDefined()
      expect(client.name).toBe('Test Client App')
      expect(client.notes).toBe('A test client application')
      expect(client.permissions).toBeDefined()
      expect(client.active).toBe(true)

      // Check managers - may be populated objects or IDs
      const managerIds = Array.isArray(client.managers)
        ? client.managers.map((m) => (typeof m === 'string' ? m : m.id))
        : []
      expect(managerIds).toContain(testUser.id)

      // Check primary contact - may be populated object or ID
      const primaryContactId =
        typeof client.primaryContact === 'string'
          ? client.primaryContact
          : client.primaryContact?.id
      expect(primaryContactId).toBe(testUser.id)

      // API key should not be generated yet
      expect(client.apiKey).toBeNull()
      expect(client.usageStats).toBeDefined()
      expect(client.usageStats?.totalRequests).toBe(0)
      expect(client.usageStats?.dailyRequests).toBe(0)
    })

    it('enforces primary contact is in managers list', async () => {
      const client = await testData.createClient(payload, {
        managers: [testUser.id],
        primaryContact: testUser2.id, // Different from managers
      })

      // Primary contact should be automatically added to managers
      const managerIds = Array.isArray(client.managers)
        ? client.managers.map((m) => (typeof m === 'string' ? m : m.id))
        : []
      expect(managerIds).toContain(testUser.id)
      expect(managerIds).toContain(testUser2.id)

      const primaryContactId =
        typeof client.primaryContact === 'string'
          ? client.primaryContact
          : client.primaryContact?.id
      expect(primaryContactId).toBe(testUser2.id)
    })

    it('updates client information', async () => {
      const client = await testData.createClient(payload)

      const updated = (await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          name: 'Updated Client Name',
          active: false,
        },
      })) as Client

      expect(updated.name).toBe('Updated Client Name')
      expect(updated.active).toBe(false)
    })

    it('deletes a client', async () => {
      const client = await testData.createClient(payload)

      await payload.delete({
        collection: 'clients',
        id: client.id,
      })

      // Verify deletion
      await expect(
        payload.findByID({
          collection: 'clients',
          id: client.id,
        }),
      ).rejects.toThrow()
    })
  })

  describe('Validation', () => {
    it('requires name field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            role: 'full-access',
            managers: [testUser.id],
            primaryContact: testUser.id,
            active: true,
          } as any,
        }),
      ).rejects.toThrow()
    })

    it('requires managers field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            name: 'Invalid Client',
            role: 'full-access',
            primaryContact: testUser.id,
            active: true,
          } as any,
        }),
      ).rejects.toThrow()
    })

    it('requires primary contact field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            name: 'Invalid Client',
            role: 'full-access',
            managers: [testUser.id],
            active: true,
          } as any,
        }),
      ).rejects.toThrow()
    })
  })

  describe('Manager Association', () => {
    it('maintains primary contact relationship', async () => {
      const client = await testData.createClient(payload, {
        managers: [testUser.id, testUser2.id],
        primaryContact: testUser2.id,
      })

      const primaryContactId =
        typeof client.primaryContact === 'string'
          ? client.primaryContact
          : client.primaryContact?.id
      expect(primaryContactId).toBe(testUser2.id)

      const managerIds = Array.isArray(client.managers)
        ? client.managers.map((m) => (typeof m === 'string' ? m : m.id))
        : []
      expect(managerIds).toContain(testUser2.id)
    })
  })

  describe('Usage Stats', () => {
    it('initializes usage stats on creation', async () => {
      const client = await testData.createClient(payload)

      expect(client.usageStats).toBeDefined()
      expect(client.usageStats?.totalRequests).toBe(0)
      expect(client.usageStats?.dailyRequests).toBe(0)
      // The field structure should exist even if values are null
      expect(typeof client.usageStats).toBe('object')
    })
  })
})
