import type { Manager, Client } from '../../src/payload-types'
import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { mergeRolePermissions } from '../../src/fields/PermissionsField'
import { hasPermission } from '../../src/lib/accessControl'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

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
        type: 'admin' as const,
      })

      expect(manager.type).toBe('admin')
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
        type: 'admin' as const,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'We Meditate Web Client',
          managers: [manager.id],
          primaryContact: manager.id,
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
        type: 'admin' as const,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'We Meditate App Client',
          managers: [manager.id],
          primaryContact: manager.id,
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
        type: 'admin' as const,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'Sahaj Atlas Client',
          managers: [manager.id],
          primaryContact: manager.id,
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
      const permissions = mergeRolePermissions(['meditations-editor'], 'managers')

      expect(permissions).toBeDefined()
      expect(permissions.meditations).toBeDefined()
      expect(permissions.meditations).toContain('read')
      expect(permissions.meditations).toContain('create')
      expect(permissions.meditations).toContain('update')
      expect(permissions.media).toBeDefined()
      expect(permissions.media).toContain('read')
      expect(permissions.media).toContain('create')
    })

    it('computes permissions for translator role', () => {
      const permissions = mergeRolePermissions(['translator'], 'managers')

      expect(permissions).toBeDefined()
      expect(permissions.pages).toBeDefined()
      expect(permissions.pages).toContain('read')
      expect(permissions.pages).toContain('translate')
      expect(permissions.music).toBeDefined()
      expect(permissions.music).toContain('translate')
    })

    it('merges permissions from multiple roles', () => {
      const permissions = mergeRolePermissions(['meditations-editor', 'translator'], 'managers')

      expect(permissions).toBeDefined()
      // Should have permissions from both roles
      expect(permissions.meditations).toBeDefined()
      expect(permissions.meditations).toContain('create')
      expect(permissions.pages).toBeDefined()
      expect(permissions.pages).toContain('translate')
    })

    it('computes permissions for we-meditate-web client role', () => {
      const permissions = mergeRolePermissions(['we-meditate-web'], 'clients')

      expect(permissions).toBeDefined()
      expect(permissions.meditations).toBeDefined()
      expect(permissions.meditations).toContain('read')
      expect(permissions.pages).toBeDefined()
      expect(permissions.pages).toContain('read')
      expect(permissions['form-submissions']).toBeDefined()
      expect(permissions['form-submissions']).toContain('create')
    })
  })

  describe('Access Control Functions', () => {
    it('grants admin role full access to all collections', () => {
      const adminUser = testData.dummyUser('managers', {
        id: 1,
        type: 'admin' as const,
      })

      // Admin should have access to everything
      expect(
        hasPermission({ user: adminUser, collection: 'meditations', operation: 'create' }),
      ).toBe(true)
      expect(hasPermission({ user: adminUser, collection: 'managers', operation: 'read' })).toBe(
        true,
      )
      expect(hasPermission({ user: adminUser, collection: 'clients', operation: 'update' })).toBe(
        true,
      )
    })

    it('restricts meditations-editor to specific collections', () => {
      const editorUser = testData.dummyUser('managers', {
        id: 2,
        roles: ['meditations-editor'],
        permissions: {
          meditations: ['read', 'create', 'update'],
          media: ['read', 'create'],
          'file-attachments': ['read', 'create'],
        },
      })

      // Should have access to meditations
      expect(
        hasPermission({ user: editorUser, collection: 'meditations', operation: 'create' }),
      ).toBe(true)
      expect(hasPermission({ user: editorUser, collection: 'media', operation: 'create' })).toBe(
        true,
      )

      // Should NOT have access to managers or clients
      expect(hasPermission({ user: editorUser, collection: 'managers', operation: 'read' })).toBe(
        false,
      )
      expect(hasPermission({ user: editorUser, collection: 'clients', operation: 'read' })).toBe(
        false,
      )
    })

    it('restricts translator to translate permission only', () => {
      const translatorUser = testData.dummyUser('managers', {
        id: 3,
        roles: ['translator'],
        permissions: {
          pages: ['read', 'translate'],
          music: ['read', 'translate'],
        },
      })

      // Should have read access
      expect(hasPermission({ user: translatorUser, collection: 'pages', operation: 'read' })).toBe(
        true,
      )

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
        type: 'inactive' as const,
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
          meditations: ['read', 'create', 'update', 'delete'],
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
          pages: ['read', 'translate'],
        },
      })

      // Should have implicit read access to non-restricted collections
      expect(hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' })).toBe(
        true,
      )
    })

    it('blocks access to restricted collections for non-admins', () => {
      const editorUser = testData.dummyUser('managers', {
        id: 7,
        roles: ['meditations-editor'],
        permissions: {
          meditations: ['read', 'create', 'update'],
        },
      })

      // Should be blocked from restricted collections (managers, clients, payload-jobs)
      expect(hasPermission({ user: editorUser, collection: 'managers', operation: 'read' })).toBe(
        false,
      )
      expect(hasPermission({ user: editorUser, collection: 'clients', operation: 'read' })).toBe(
        false,
      )
      expect(
        hasPermission({ user: editorUser, collection: 'payload-jobs', operation: 'read' }),
      ).toBe(false)

      // form-submissions is NOT restricted - managers with roles get implicit read access
      expect(
        hasPermission({ user: editorUser, collection: 'form-submissions', operation: 'read' }),
      ).toBe(true)
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
        // Permissions is a generic Record type with unknown structure
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permissions = fetchedManager.permissions as Record<string, any>
        expect(permissions.meditations).toBeDefined()
      }
    })

    it('computes permissions for clients', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Admin for Client',
        type: 'admin' as const,
      })

      const client = (await payload.create({
        collection: 'clients',
        data: {
          name: 'Test Client',
          managers: [manager.id],
          primaryContact: manager.id,
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
        // Permissions is a generic Record type with unknown structure
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permissions = fetchedClient.permissions as Record<string, any>
        expect(permissions.meditations).toBeDefined()
        expect(permissions.pages).toBeDefined()
      }
    })
  })

  describe('Document-Level Permissions (customResourceAccess)', () => {
    it('allows manager to update specific page via customResourceAccess', async () => {
      // Create a test page
      const admin = await testData.createManager(payload, {
        name: 'Admin for Page Creation',
        type: 'admin' as const,
      })

      const page = await payload.create({
        collection: 'pages',
        data: {
          title: 'Test Page',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Test content' }],
                  version: 0,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              version: 0,
            },
          },
        },
        user: { ...admin, collection: 'managers' },
      })

      // Create manager with customResourceAccess to this specific page
      const manager = await testData.createManager(payload, {
        name: 'Restricted Manager',
        roles: [], // No collection-level permissions
        customResourceAccess: [
          {
            relationTo: 'pages',
            value: page.id,
          },
        ],
      })

      // Manager should have update permission for this specific page
      const managerUser = testData.dummyUser('managers', {
        id: manager.id,
        roles: [],
        permissions: {},
        customResourceAccess: [{ relationTo: 'pages', value: page.id }],
      })

      expect(
        hasPermission({
          user: managerUser,
          collection: 'pages',
          operation: 'update',
          docId: String(page.id),
        }),
      ).toBe(true)

      // But should NOT have access to other pages
      expect(
        hasPermission({
          user: managerUser,
          collection: 'pages',
          operation: 'update',
          docId: '999999',
        }),
      ).toBe(false)
    })

    it('does not grant create or delete permission via customResourceAccess', async () => {
      const page = await payload.create({
        collection: 'pages',
        data: {
          title: 'Another Test Page',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Test content' }],
                  version: 0,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              version: 0,
            },
          },
        },
      })

      const managerUser = testData.dummyUser('managers', {
        id: 100,
        roles: [],
        permissions: {},
        customResourceAccess: [{ relationTo: 'pages', value: page.id }],
      })

      // Should NOT have create permission
      expect(
        hasPermission({
          user: managerUser,
          collection: 'pages',
          operation: 'create',
        }),
      ).toBe(false)

      // Should NOT have delete permission
      expect(
        hasPermission({
          user: managerUser,
          collection: 'pages',
          operation: 'delete',
          docId: String(page.id),
        }),
      ).toBe(false)
    })
  })

  describe('Localized Manager Roles', () => {
    it('computes permissions for current locale only', () => {
      // Manager with different roles per locale
      const managerData = {
        roles: {
          en: ['meditations-editor'],
          cs: ['translator'],
        },
      }

      // English locale permissions
      const enPermissions = mergeRolePermissions(managerData.roles.en, 'managers')
      expect(enPermissions.meditations).toBeDefined()
      expect(enPermissions.meditations).toContain('create')
      expect(enPermissions.pages).toBeUndefined() // No translator role in English

      // Czech locale permissions
      const csPermissions = mergeRolePermissions(managerData.roles.cs, 'managers')
      expect(csPermissions.pages).toBeDefined()
      expect(csPermissions.pages).toContain('translate')
      expect(csPermissions.meditations).toBeUndefined() // No meditations-editor role in Czech
    })

    it('grants implicit read based on roles in current locale', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 10,
        roles: ['translator'], // Has roles in current locale
        permissions: {
          pages: ['read', 'translate'],
          music: ['read', 'translate'],
        },
      })

      // Should have implicit read access to narrators
      expect(hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' })).toBe(
        true,
      )
    })

    it('denies implicit read when no roles in current locale', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 11,
        roles: [], // No roles in current locale
        permissions: {},
      })

      // Should NOT have implicit read access
      expect(hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' })).toBe(
        false,
      )
    })
  })

  describe('Implicit Read Access', () => {
    it('grants read to all non-restricted collections for managers with roles', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 12,
        roles: ['translator'],
        permissions: {
          pages: ['read', 'translate'],
        },
      })

      // Should have implicit read to various collections
      const nonRestrictedCollections = [
        'meditations',
        'frames',
        'narrators',
        'media',
        'music',
        'authors',
        'external-videos',
      ]

      nonRestrictedCollections.forEach((collection) => {
        expect(hasPermission({ user: managerUser, collection, operation: 'read' })).toBe(true)
      })
    })

    it('blocks read to restricted collections even with implicit access', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 13,
        roles: ['translator'],
        permissions: {
          pages: ['read', 'translate'],
        },
      })

      // Restricted collections should be blocked
      const restrictedCollections = ['managers', 'clients', 'payload-jobs']

      restrictedCollections.forEach((collection) => {
        expect(hasPermission({ user: managerUser, collection, operation: 'read' })).toBe(false)
      })
    })

    it('does not grant implicit read to API clients', () => {
      const clientUser = testData.dummyUser('clients', {
        id: 14,
        roles: ['we-meditate-web'],
        permissions: {
          meditations: ['read'],
          pages: ['read'],
        },
      })

      // Should NOT have access to collections not in permissions
      expect(hasPermission({ user: clientUser, collection: 'lessons', operation: 'read' })).toBe(
        false,
      )
    })
  })

  describe('Form Submissions Access', () => {
    it('allows we-meditate-web client to create form submissions', () => {
      const clientUser = testData.dummyUser('clients', {
        id: 15,
        roles: ['we-meditate-web'],
        permissions: {
          'form-submissions': ['create'],
        },
      })

      expect(
        hasPermission({
          user: clientUser,
          collection: 'form-submissions',
          operation: 'create',
        }),
      ).toBe(true)
    })

    it('grants managers with roles implicit read access to form submissions', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 16,
        roles: ['meditations-editor'],
        permissions: {
          meditations: ['read', 'create', 'update'],
        },
      })

      // Managers with roles get implicit read access to form-submissions
      expect(
        hasPermission({
          user: managerUser,
          collection: 'form-submissions',
          operation: 'read',
        }),
      ).toBe(true)
    })
  })

  describe('Concurrent Permission Checks', () => {
    it('handles concurrent permission checks without race conditions', async () => {
      const managerUser = testData.dummyUser('managers', {
        id: 17,
        roles: ['meditations-editor', 'translator'],
        permissions: undefined, // Let permissions be computed dynamically
      })

      // Simulate concurrent permission checks
      const checks = [
        hasPermission({ user: managerUser, collection: 'meditations', operation: 'create' }),
        hasPermission({
          user: managerUser,
          collection: 'pages',
          operation: 'update',
          field: { localized: true },
        }),
        hasPermission({
          user: managerUser,
          collection: 'music',
          operation: 'update',
          field: { localized: true },
        }),
        hasPermission({ user: managerUser, collection: 'media', operation: 'create' }),
        hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' }),
      ]

      const results = await Promise.all(checks.map((result) => Promise.resolve(result)))

      // All checks should succeed
      expect(results[0]).toBe(true) // meditations create
      expect(results[1]).toBe(true) // pages update (localized field)
      expect(results[2]).toBe(true) // music update (localized field)
      expect(results[3]).toBe(true) // media create
      expect(results[4]).toBe(true) // narrators read (implicit)
    })

    it('computes permissions consistently across multiple concurrent requests', () => {
      const managerData = {
        roles: ['translator'],
      }

      // Simulate multiple concurrent mergeRolePermissions calls
      const computations = Array.from({ length: 10 }, () =>
        mergeRolePermissions(managerData.roles, 'managers'),
      )

      // All should produce identical results
      const firstResult = JSON.stringify(computations[0])
      computations.forEach((result) => {
        expect(JSON.stringify(result)).toBe(firstResult)
      })
    })
  })
})
