import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'
import { hasPermission, computePermissions } from '@/lib/accessControl'
import type { Manager, Client } from '@/payload-types'

describe('Role-Based Access Control', () => {
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

  describe('Manager Roles', () => {
    it('creates manager with admin role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Admin Manager',
        admin: true,
      })

      expect(manager.admin).toBe(true)
    })

    it('creates manager with meditations-editor role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Meditations Editor',
        roles: ['meditations-editor'],
      })

      expect(manager.roles).toBeDefined()
      if (Array.isArray(manager.roles)) {
        expect(manager.roles[0]).toBe('meditations-editor')
      }
    })

    it('creates manager with path-editor role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Path Editor',
        roles: ['path-editor'],
      })

      expect(manager.roles).toBeDefined()
      if (Array.isArray(manager.roles)) {
        expect(manager.roles[0]).toBe('path-editor')
      }
    })

    it('creates manager with translator role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Translator',
        roles: ['translator'],
      })

      expect(manager.roles).toBeDefined()
      if (Array.isArray(manager.roles)) {
        expect(manager.roles[0]).toBe('translator')
      }
    })

    it('allows manager with multiple roles', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Multi-Role Manager',
        roles: ['meditations-editor', 'translator'],
      })

      expect(manager.roles).toBeDefined()
      if (Array.isArray(manager.roles)) {
        expect(manager.roles).toHaveLength(2)
        expect(manager.roles[0]).toBe('meditations-editor')
        expect(manager.roles[1]).toBe('translator')
      }
    })
  })

  describe('Client Roles', () => {
    it('creates client with we-meditate-web role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Admin for Client Creation',
        admin: true,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'We Meditate Web Client',
          owner: manager.id,
          roles: ['we-meditate-web'],
        },
      })) as Client

      expect(client.roles).toBeDefined()
      expect(Array.isArray(client.roles)).toBe(true)
      if (Array.isArray(client.roles)) {
        expect(client.roles[0]).toBe('we-meditate-web')
      }
    })

    it('creates client with we-meditate-app role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Admin for Client Creation',
        admin: true,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'We Meditate App Client',
          owner: manager.id,
          roles: ['we-meditate-app'],
        },
      })) as Client

      expect(client.roles).toBeDefined()
      if (Array.isArray(client.roles)) {
        expect(client.roles[0]).toBe('we-meditate-app')
      }
    })

    it('creates client with sahaj-atlas role', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Admin for Client Creation',
        admin: true,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'Sahaj Atlas Client',
          owner: manager.id,
          roles: ['sahaj-atlas'],
        },
      })) as Client

      expect(client.roles).toBeDefined()
      if (Array.isArray(client.roles)) {
        expect(client.roles[0]).toBe('sahaj-atlas')
      }
    })
  })

  describe('Permission Computation', () => {
    it('computes permissions for meditations-editor role', () => {
      const permissions = computePermissions(
        { roles: ['meditations-editor'] },
        'en',
        false, // isManager
      )

      expect(permissions).toBeDefined()
      expect(permissions.meditations).toBeDefined()
      expect(permissions.meditations.operations).toContain('read')
      expect(permissions.meditations.operations).toContain('create')
      expect(permissions.meditations.operations).toContain('update')
      expect(permissions.media).toBeDefined()
      expect(permissions.media.operations).toContain('read')
      expect(permissions.media.operations).toContain('create')
    })

    it('computes permissions for translator role', () => {
      const permissions = computePermissions({ roles: ['translator'] }, 'en', false)

      expect(permissions).toBeDefined()
      expect(permissions.pages).toBeDefined()
      expect(permissions.pages.operations).toContain('read')
      expect(permissions.pages.operations).toContain('translate')
      expect(permissions.music).toBeDefined()
      expect(permissions.music.operations).toContain('translate')
    })

    it('merges permissions from multiple roles', () => {
      const permissions = computePermissions(
        { roles: ['meditations-editor', 'translator'] },
        'en',
        false,
      )

      expect(permissions).toBeDefined()
      // Should have permissions from both roles
      expect(permissions.meditations).toBeDefined()
      expect(permissions.meditations.operations).toContain('create')
      expect(permissions.pages).toBeDefined()
      expect(permissions.pages.operations).toContain('translate')
    })

    it('computes permissions for we-meditate-web client role', () => {
      const permissions = computePermissions(
        { roles: ['we-meditate-web'] },
        'en',
        true, // isClient
      )

      expect(permissions).toBeDefined()
      expect(permissions.meditations).toBeDefined()
      expect(permissions.meditations.operations).toContain('read')
      expect(permissions.pages).toBeDefined()
      expect(permissions.pages.operations).toContain('read')
      expect(permissions['form-submissions']).toBeDefined()
      expect(permissions['form-submissions'].operations).toContain('create')
    })
  })

  describe('Access Control Functions', () => {
    it('grants admin role full access to all collections', () => {
      const adminUser = testData.dummyUser('managers', {
        id: 1,
        admin: true,
      })

      // Admin should have access to everything
      expect(
        hasPermission({ user: adminUser, collection: 'meditations', operation: 'create' }),
      ).toBe(true)
      expect(
        hasPermission({ user: adminUser, collection: 'managers', operation: 'read' }),
      ).toBe(true)
      expect(
        hasPermission({ user: adminUser, collection: 'clients', operation: 'update' }),
      ).toBe(true)
    })

    it('restricts meditations-editor to specific collections', () => {
      const editorUser = testData.dummyUser('managers', {
        id: 2,
        roles: ['meditations-editor'],
        permissions: {
          meditations: { operations: ['read', 'create', 'update'] },
          media: { operations: ['read', 'create'] },
          'file-attachments': { operations: ['read', 'create'] },
        },
      })

      // Should have access to meditations
      expect(
        hasPermission({ user: editorUser, collection: 'meditations', operation: 'create' }),
      ).toBe(true)
      expect(
        hasPermission({ user: editorUser, collection: 'media', operation: 'create' }),
      ).toBe(true)

      // Should NOT have access to managers or clients
      expect(
        hasPermission({ user: editorUser, collection: 'managers', operation: 'read' }),
      ).toBe(false)
      expect(
        hasPermission({ user: editorUser, collection: 'clients', operation: 'read' }),
      ).toBe(false)
    })

    it('restricts translator to translate permission only', () => {
      const translatorUser = testData.dummyUser('managers', {
        id: 3,
        roles: ['translator'],
        permissions: {
          pages: { operations: ['read', 'translate'] },
          music: { operations: ['read', 'translate'] },
        },
      })

      // Should have read access
      expect(
        hasPermission({ user: translatorUser, collection: 'pages', operation: 'read' }),
      ).toBe(true)

      // Should have translate access with localized field
      expect(
        hasPermission({
          user: translatorUser,
          collection: 'pages',
          operation: 'update',
          field: { localized: true },
        }),
      ).toBe(true)

      // Should NOT have update access for non-localized fields
      expect(
        hasPermission({
          user: translatorUser,
          collection: 'pages',
          operation: 'update',
          field: { localized: false },
        }),
      ).toBe(false)

      // Should NOT have create permission
      expect(
        hasPermission({ user: translatorUser, collection: 'pages', operation: 'create' }),
      ).toBe(false)
    })

    it('blocks inactive users', () => {
      const inactiveUser = testData.dummyUser('managers', {
        id: 4,
        active: false,
        admin: true,
      })

      expect(
        hasPermission({ user: inactiveUser, collection: 'meditations', operation: 'read' }),
      ).toBe(false)
    })

    it('blocks API clients from delete operations', () => {
      const clientUser = testData.dummyUser('clients', {
        id: 5,
        roles: ['we-meditate-web'],
        permissions: {
          meditations: { operations: ['read', 'create', 'update', 'delete'] },
        },
      })

      // Read should work
      expect(
        hasPermission({ user: clientUser, collection: 'meditations', operation: 'read' }),
      ).toBe(true)

      // Delete should be blocked even with permission
      expect(
        hasPermission({ user: clientUser, collection: 'meditations', operation: 'delete' }),
      ).toBe(false)
    })

    it('grants managers implicit read access with roles', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 6,
        roles: ['translator'],
        permissions: {
          pages: { operations: ['read', 'translate'] },
        },
      })

      // Should have implicit read access to non-restricted collections
      expect(
        hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' }),
      ).toBe(true)
    })

    it('blocks access to restricted collections for non-admins', () => {
      const editorUser = testData.dummyUser('managers', {
        id: 7,
        roles: ['meditations-editor'],
        permissions: {
          meditations: { operations: ['read', 'create', 'update'] },
        },
      })

      // Should be blocked from restricted collections
      expect(
        hasPermission({ user: editorUser, collection: 'managers', operation: 'read' }),
      ).toBe(false)
      expect(
        hasPermission({ user: editorUser, collection: 'clients', operation: 'read' }),
      ).toBe(false)
      expect(
        hasPermission({ user: editorUser, collection: 'form-submissions', operation: 'read' }),
      ).toBe(false)
      expect(
        hasPermission({ user: editorUser, collection: 'payload-jobs', operation: 'read' }),
      ).toBe(false)
    })
  })

  describe('Permissions Field', () => {
    it('computes and displays permissions for managers', async () => {
      const manager = (await testData.createManager(payload, {
        name: 'Test Editor',
        roles: ['meditations-editor'],
      })) as Manager

      // Fetch with depth to ensure permissions are computed
      const fetchedManager = (await payload.findByID({
        collection: 'managers',
        id: manager.id,
      })) as Manager

      // Permissions should be computed via afterRead hook
      expect(fetchedManager.permissions).toBeDefined()
      if (
        fetchedManager.permissions &&
        typeof fetchedManager.permissions === 'object' &&
        !Array.isArray(fetchedManager.permissions)
      ) {
        const permissions = fetchedManager.permissions as Record<string, any>
        expect(permissions.meditations).toBeDefined()
      }
    })

    it('computes permissions for clients', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Admin for Client',
        admin: true,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'Test Client',
          owner: manager.id,
          roles: ['we-meditate-web'],
        },
      })) as Client

      const fetchedClient = (await payload.findByID({
        collection: 'clients',
        id: client.id,
      })) as Client

      expect(fetchedClient.permissions).toBeDefined()
      if (
        fetchedClient.permissions &&
        typeof fetchedClient.permissions === 'object' &&
        !Array.isArray(fetchedClient.permissions)
      ) {
        const permissions = fetchedClient.permissions as Record<string, any>
        expect(permissions.meditations).toBeDefined()
        expect(permissions.pages).toBeDefined()
      }
    })
  })
})
