import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { ManagerRole } from '../../src/lib/access'

import { getPermissionsForRoles } from '../../src/generated/access'
import { hasPermission } from '../../src/lib/access'
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
      // Permissions are computed from roles, not explicitly set
      const editorUser = testData.dummyUser('managers', {
        id: 2,
        roles: ['meditations-editor'],
      })

      // Should have access to meditations (from role definition)
      expect(
        hasPermission({ user: editorUser, collection: 'meditations', operation: 'create' }),
      ).toBe(true)
      // Should have access to images (renamed from 'media')
      expect(hasPermission({ user: editorUser, collection: 'images', operation: 'create' })).toBe(
        true,
      )

      // Should NOT have access to managers or clients (restricted collections)
      expect(hasPermission({ user: editorUser, collection: 'managers', operation: 'read' })).toBe(
        false,
      )
      expect(hasPermission({ user: editorUser, collection: 'clients', operation: 'read' })).toBe(
        false,
      )
    })

    it('restricts translator to translate permission only', () => {
      // Permissions are computed from roles, not explicitly set
      const translatorUser = testData.dummyUser('managers', {
        id: 3,
        roles: ['translator'],
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
      // Permissions are computed from roles, not explicitly set
      const clientUser = testData.dummyUser('clients', {
        id: 5,
        roles: ['wemeditate-web'],
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
      // Permissions are computed from roles, not explicitly set
      const managerUser = testData.dummyUser('managers', {
        id: 6,
        roles: ['translator'],
      })

      // Should have implicit read access to non-restricted collections
      expect(hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' })).toBe(
        true,
      )
    })

    it('blocks access to restricted collections for non-admins', () => {
      // Permissions are computed from roles, not explicitly set
      const editorUser = testData.dummyUser('managers', {
        id: 7,
        roles: ['meditations-editor'],
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
      const enPermissions = getPermissionsForRoles(managerData.roles.en as ManagerRole[], 'managers')
      expect(enPermissions.meditations).toBeDefined()
      expect(enPermissions.meditations).toContain('create')
      expect(enPermissions.pages).toBeUndefined() // No translator role in English

      // Czech locale permissions
      const csPermissions = getPermissionsForRoles(managerData.roles.cs as ManagerRole[], 'managers')
      expect(csPermissions.pages).toBeDefined()
      expect(csPermissions.pages).toContain('translate')
      expect(csPermissions.meditations).toBeUndefined() // No meditations-editor role in Czech
    })

    it('grants implicit read based on roles in current locale', () => {
      // Permissions are computed from roles, not explicitly set
      const managerUser = testData.dummyUser('managers', {
        id: 10,
        roles: ['translator'], // Has roles in current locale
      })

      // Should have implicit read access to narrators
      expect(hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' })).toBe(
        true,
      )
    })

    it('denies implicit read when no roles in current locale', () => {
      // Empty roles = no permissions computed
      const managerUser = testData.dummyUser('managers', {
        id: 11,
        roles: [], // No roles in current locale
      })

      // Should NOT have implicit read access
      expect(hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' })).toBe(
        false,
      )
    })
  })

  describe('Implicit Read Access', () => {
    it('grants read to all non-restricted collections for managers with roles', () => {
      // Permissions are computed from roles, not explicitly set
      const managerUser = testData.dummyUser('managers', {
        id: 12,
        roles: ['translator'],
      })

      // Should have implicit read to various collections
      const nonRestrictedCollections = [
        'meditations',
        'frames',
        'narrators',
        'media',
        'music',
        'authors',
        'lectures',
      ]

      nonRestrictedCollections.forEach((collection) => {
        expect(hasPermission({ user: managerUser, collection, operation: 'read' })).toBe(true)
      })
    })

    it('blocks read to restricted collections even with implicit access', () => {
      // Permissions are computed from roles, not explicitly set
      const managerUser = testData.dummyUser('managers', {
        id: 13,
        roles: ['translator'],
      })

      // Restricted collections should be blocked
      const restrictedCollections = ['managers', 'clients', 'payload-jobs']

      restrictedCollections.forEach((collection) => {
        expect(hasPermission({ user: managerUser, collection, operation: 'read' })).toBe(false)
      })
    })

    it('does not grant implicit read to API clients', () => {
      // Permissions are computed from roles, not explicitly set
      const clientUser = testData.dummyUser('clients', {
        id: 14,
        roles: ['wemeditate-web'],
      })

      // Should NOT have access to collections not in permissions
      expect(hasPermission({ user: clientUser, collection: 'lessons', operation: 'read' })).toBe(
        false,
      )
    })
  })

  describe('Concurrent Permission Checks', () => {
    it('handles concurrent permission checks without race conditions', async () => {
      // Permissions are computed from roles dynamically
      const managerUser = testData.dummyUser('managers', {
        id: 17,
        roles: ['meditations-editor', 'translator'],
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
        hasPermission({ user: managerUser, collection: 'images', operation: 'create' }),
        hasPermission({ user: managerUser, collection: 'narrators', operation: 'read' }),
      ]

      const results = await Promise.all(checks.map((result) => Promise.resolve(result)))

      // All checks should succeed
      expect(results[0]).toBe(true) // meditations create
      expect(results[1]).toBe(true) // pages update (localized field)
      expect(results[2]).toBe(true) // music update (localized field)
      expect(results[3]).toBe(true) // images create
      expect(results[4]).toBe(true) // narrators read (implicit)
    })

    it('computes permissions consistently across multiple concurrent requests', () => {
      const managerData = {
        roles: ['translator'],
      }

      // Simulate multiple concurrent getPermissionsForRoles calls
      const computations = Array.from({ length: 10 }, () =>
        getPermissionsForRoles(managerData.roles as ManagerRole[], 'managers'),
      )

      // All should produce identical results
      const firstResult = JSON.stringify(computations[0])
      computations.forEach((result) => {
        expect(JSON.stringify(result)).toBe(firstResult)
      })
    })
  })
})
