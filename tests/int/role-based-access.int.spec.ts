import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { bypassPermissions, hasAnyPermission, hasPermission } from '@/lib/access'

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
        hasPermission(
          { user: adminUser, collection: 'meditations', operation: 'create' },
          bypassPermissions,
        ),
      ).toBe(true)
      expect(
        hasPermission(
          { user: adminUser, collection: 'managers', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)
      expect(
        hasPermission(
          { user: adminUser, collection: 'clients', operation: 'update' },
          bypassPermissions,
        ),
      ).toBe(true)
    })

    it('restricts translator to translate permission only', () => {
      // Permissions are computed from roles, not explicitly set
      const translatorUser = testData.dummyUser('managers', {
        id: 3,
        roles: ['web-translator'],
      })

      // Should have read access
      expect(
        hasPermission(
          { user: translatorUser, collection: 'pages', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)

      // Should have translate access with localized field
      expect(
        hasPermission(
          {
            user: translatorUser,
            collection: 'pages',
            operation: 'update',
            field: { localized: true },
          },
          bypassPermissions,
        ),
      ).toBe(true)

      // Should NOT have update access for non-localized fields
      expect(
        hasPermission(
          {
            user: translatorUser,
            collection: 'pages',
            operation: 'update',
            field: { localized: false },
          },
          bypassPermissions,
        ),
      ).toBe(false)

      // Should NOT have update access for fields without explicit localized property
      // (implicitly non-localized in PayloadCMS)
      expect(
        hasPermission(
          {
            user: translatorUser,
            collection: 'pages',
            operation: 'update',
            field: {},
          },
          bypassPermissions,
        ),
      ).toBe(false)

      // Should NOT have update access for fields with undefined localized
      expect(
        hasPermission(
          {
            user: translatorUser,
            collection: 'pages',
            operation: 'update',
            field: { localized: undefined },
          },
          bypassPermissions,
        ),
      ).toBe(false)

      // Should NOT have create permission
      expect(
        hasPermission(
          { user: translatorUser, collection: 'pages', operation: 'create' },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('blocks inactive users', () => {
      const inactiveUser = testData.dummyUser('managers', {
        id: 4,
        type: 'inactive' as const,
      })

      expect(
        hasPermission(
          { user: inactiveUser, collection: 'meditations', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('blocks API clients from delete operations', () => {
      // Permissions are computed from roles, not explicitly set
      const clientUser = testData.dummyUser('clients', {
        id: 5,
        roles: ['wemeditate-web-client'],
      })

      // Read should work
      expect(
        hasPermission(
          { user: clientUser, collection: 'meditations', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)

      // Delete should be blocked even with permission
      expect(
        hasPermission(
          { user: clientUser, collection: 'meditations', operation: 'delete' },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('grants managers implicit read access with roles', () => {
      // Permissions are computed from roles, not explicitly set
      const managerUser = testData.dummyUser('managers', {
        id: 6,
        roles: ['web-translator'],
      })

      // Should have implicit read access to non-restricted collections
      expect(
        hasPermission(
          { user: managerUser, collection: 'narrators', operation: 'read' },
          bypassPermissions,
        ),
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
        hasPermission(
          {
            user: managerUser,
            collection: 'pages',
            operation: 'update',
            docId: String(page.id),
          },
          bypassPermissions,
        ),
      ).toBe(true)

      // But should NOT have access to other pages
      expect(
        hasPermission(
          {
            user: managerUser,
            collection: 'pages',
            operation: 'update',
            docId: '999999',
          },
          bypassPermissions,
        ),
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
        hasPermission(
          {
            user: managerUser,
            collection: 'pages',
            operation: 'create',
          },
          bypassPermissions,
        ),
      ).toBe(false)

      // Should NOT have delete permission
      expect(
        hasPermission(
          {
            user: managerUser,
            collection: 'pages',
            operation: 'delete',
            docId: String(page.id),
          },
          bypassPermissions,
        ),
      ).toBe(false)
    })
  })

  describe('Localized Manager Roles', () => {
    it('grants implicit read based on roles in current locale', () => {
      // Permissions are computed from roles, not explicitly set
      const managerUser = testData.dummyUser('managers', {
        id: 10,
        roles: ['web-translator'], // Has roles in current locale
      })

      // Should have implicit read access to narrators
      expect(
        hasPermission(
          { user: managerUser, collection: 'narrators', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)
    })

    it('denies implicit read when no roles in current locale', () => {
      // Empty roles = no permissions computed
      const managerUser = testData.dummyUser('managers', {
        id: 11,
        roles: [], // No roles in current locale
      })

      // Should NOT have implicit read access
      expect(
        hasPermission(
          { user: managerUser, collection: 'narrators', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
    })
  })

  describe('Implicit Read Access', () => {
    it('grants read to project collections for managers with roles', () => {
      // Permissions are computed from roles, not explicitly set
      // Translator role is in wemeditate-web project
      const managerUser = testData.dummyUser('managers', {
        id: 12,
        roles: ['web-translator'],
      })

      // Should have implicit read to collections in wemeditate-web project
      // Note: video-tags removed - now inline enum strings on Videos collection
      const webProjectCollections = [
        'pages',
        'meditations',
        'frames',
        'narrators',
        'songs',
        'authors',
        'albums',
        'videos',
        'forms',
        'form-submissions',
      ]

      webProjectCollections.forEach((collection) => {
        expect(
          hasPermission({ user: managerUser, collection, operation: 'read' }, bypassPermissions),
        ).toBe(true)
      })

      // Should NOT have implicit read to collections only in other projects
      expect(
        hasPermission(
          { user: managerUser, collection: 'lessons', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
      expect(
        hasPermission(
          { user: managerUser, collection: 'lectures', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('does not grant implicit read to API clients', () => {
      // Permissions are computed from roles, not explicitly set
      const clientUser = testData.dummyUser('clients', {
        id: 14,
        roles: ['wemeditate-web-client'],
      })

      // Should NOT have access to collections not in wemeditate-web project (lessons is in wemeditate-app)
      expect(
        hasPermission(
          { user: clientUser, collection: 'lessons', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('grants read access to Videos in both wemeditate projects', () => {
      // Note: video-tags collection removed - now inline enum strings on Videos collection
      // wemeditate-web-client should have read access to videos
      const webClient = testData.dummyUser('clients', {
        id: 15,
        roles: ['wemeditate-web-client'],
      })

      expect(
        hasPermission(
          { user: webClient, collection: 'videos', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)

      // wemeditate-app-client should also have read access to videos
      const appClient = testData.dummyUser('clients', {
        id: 16,
        roles: ['wemeditate-app-client'],
      })

      expect(
        hasPermission(
          { user: appClient, collection: 'videos', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)
    })
  })

  describe('Concurrent Permission Checks', () => {
    it('handles concurrent permission checks without race conditions', async () => {
      // Permissions are computed from roles dynamically
      const managerUser = testData.dummyUser('managers', {
        id: 17,
        roles: ['meditations-editor', 'web-translator'],
      })

      // Simulate concurrent permission checks
      const checks = [
        hasPermission(
          { user: managerUser, collection: 'meditations', operation: 'create' },
          bypassPermissions,
        ),
        hasPermission(
          {
            user: managerUser,
            collection: 'pages',
            operation: 'update',
            field: { localized: true },
          },
          bypassPermissions,
        ),
        hasPermission(
          {
            user: managerUser,
            collection: 'songs',
            operation: 'update',
            field: { localized: true },
          },
          bypassPermissions,
        ),
        hasPermission(
          { user: managerUser, collection: 'images', operation: 'create' },
          bypassPermissions,
        ),
        hasPermission(
          { user: managerUser, collection: 'narrators', operation: 'read' },
          bypassPermissions,
        ),
      ]

      const results = await Promise.all(checks.map((result) => Promise.resolve(result)))

      // All checks should succeed
      expect(results[0]).toBe(true) // meditations create
      expect(results[1]).toBe(true) // pages update (localized field)
      expect(results[2]).toBe(true) // songs update (localized field)
      expect(results[3]).toBe(true) // images create
      expect(results[4]).toBe(true) // narrators read (implicit)
    })
  })

  describe('hasAnyPermission() Function', () => {
    it('returns true if user has ANY of the specified operations (OR logic)', () => {
      // meditations-editor can create and update meditations, but not delete
      const editorUser = testData.dummyUser('managers', {
        id: 20,
        roles: ['meditations-editor'],
      })

      // Should return true - has create permission
      expect(
        hasAnyPermission(
          {
            user: editorUser,
            collection: 'meditations',
            operations: ['create', 'update', 'delete'],
          },
          bypassPermissions,
        ),
      ).toBe(true)

      // Should return true - has update permission
      expect(
        hasAnyPermission(
          {
            user: editorUser,
            collection: 'meditations',
            operations: ['delete', 'update'],
          },
          bypassPermissions,
        ),
      ).toBe(true)
    })

    it('returns false if user has NONE of the specified operations', () => {
      // meditations-editor cannot create/update/delete pages
      const editorUser = testData.dummyUser('managers', {
        id: 21,
        roles: ['meditations-editor'],
      })

      expect(
        hasAnyPermission(
          {
            user: editorUser,
            collection: 'pages',
            operations: ['create', 'update', 'delete'],
          },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('works correctly for visibility checking (typical use case)', () => {
      // Translator can translate pages but not create/delete
      const translatorUser = testData.dummyUser('managers', {
        id: 22,
        roles: ['web-translator'],
      })

      // Has translate permission which grants localized field update
      // So hasAnyPermission with ['create', 'update', 'delete'] should be true
      // because translate implies update capability for localized fields
      expect(
        hasAnyPermission(
          {
            user: translatorUser,
            collection: 'pages',
            operations: ['create', 'update', 'delete'],
          },
          bypassPermissions,
        ),
      ).toBe(true)

      // Manager with no roles should have no write access
      const noRolesUser = testData.dummyUser('managers', {
        id: 23,
        roles: [],
      })

      expect(
        hasAnyPermission(
          {
            user: noRolesUser,
            collection: 'pages',
            operations: ['create', 'update', 'delete'],
          },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('respects admin bypass', () => {
      const adminUser = testData.dummyUser('managers', {
        id: 24,
        type: 'admin' as const,
      })

      // Admin should have all permissions
      expect(
        hasAnyPermission(
          {
            user: adminUser,
            collection: 'managers',
            operations: ['create', 'update', 'delete'],
          },
          bypassPermissions,
        ),
      ).toBe(true)
    })
  })

  describe('Draft Filtering for API Clients', () => {
    it('client cannot list draft documents', async () => {
      // Create admin manager for creating content
      const admin = await testData.createManager(payload, {
        name: 'Admin for Draft Test',
        type: 'admin' as const,
      })

      // Create a client with wemeditate-web-client role (has access to pages)
      const client = await testData.createClient(payload, admin.id, {
        name: 'Test API Client',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      // Create a draft page (default status is draft)
      const draftPage = await payload.create({
        collection: 'pages',
        data: {
          title: 'Draft Page for Client Test',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Draft content' }],
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
        },
        user: { ...admin, collection: 'managers' },
      })

      expect(draftPage._status).toBe('draft')

      // Verify client object has collection property set correctly
      expect(client.collection).toBe('clients')

      // Query pages as client - draft should NOT appear
      // Note: overrideAccess: false is required to test access control with Local API
      const clientPages = await payload.find({
        collection: 'pages',
        user: client,
        overrideAccess: false,
      })

      const draftIds = clientPages.docs.map((doc) => doc.id)
      expect(draftIds).not.toContain(draftPage.id)
    })

    it('client cannot access draft document by ID', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Draft ID Test',
        type: 'admin' as const,
      })

      // Create a client
      const client = await testData.createClient(payload, admin.id, {
        name: 'Test API Client for ID Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      // Create a draft page
      const draftPage = await payload.create({
        collection: 'pages',
        data: {
          title: 'Draft Page for ID Test',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Draft content' }],
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
        },
        user: { ...admin, collection: 'managers' },
      })

      // Attempt to access by ID as client - should throw NotFound due to query constraint
      // Note: overrideAccess: false is required to test access control with Local API
      await expect(
        payload.findByID({
          collection: 'pages',
          id: draftPage.id,
          user: client,
          overrideAccess: false,
        }),
      ).rejects.toThrow('Not Found')
    })

    it('client can access published documents', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Published Test',
        type: 'admin' as const,
      })

      // Create a client
      const client = await testData.createClient(payload, admin.id, {
        name: 'Test API Client for Published Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      // Create and publish a page
      const draftPage = await payload.create({
        collection: 'pages',
        data: {
          title: 'Page to Publish',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Published content' }],
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
        },
        user: { ...admin, collection: 'managers' },
      })

      // Publish the page
      const publishedPage = await payload.update({
        collection: 'pages',
        id: draftPage.id,
        data: {
          _status: 'published',
        },
        user: { ...admin, collection: 'managers' },
      })

      expect(publishedPage._status).toBe('published')

      // Query pages as client - published page SHOULD appear
      // Note: overrideAccess: false is required to test access control with Local API
      const clientPages = await payload.find({
        collection: 'pages',
        user: client,
        overrideAccess: false,
      })

      const publishedIds = clientPages.docs.map((doc) => doc.id)
      expect(publishedIds).toContain(publishedPage.id)

      // Also test findByID
      const foundPage = await payload.findByID({
        collection: 'pages',
        id: publishedPage.id,
        user: client,
        overrideAccess: false,
      })

      expect(foundPage).not.toBeNull()
      expect(foundPage?.id).toBe(publishedPage.id)
    })

    it('manager can access draft documents', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Manager Draft Test',
        type: 'admin' as const,
      })

      // Create a manager with read access to pages (via web-translator role)
      const manager = await testData.createManager(payload, {
        name: 'Manager for Draft Test',
        type: 'manager' as const,
        roles: { en: ['web-translator'] },
      })

      // Create a draft page
      const draftPage = await payload.create({
        collection: 'pages',
        data: {
          title: 'Draft Page for Manager Test',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Draft content' }],
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
        },
        user: { ...admin, collection: 'managers' },
      })

      // Query pages as manager - draft SHOULD appear
      // Note: overrideAccess: false is required to test access control with Local API
      const managerPages = await payload.find({
        collection: 'pages',
        user: { ...manager, collection: 'managers' },
        overrideAccess: false,
      })

      const draftIds = managerPages.docs.map((doc) => doc.id)
      expect(draftIds).toContain(draftPage.id)
    })

    it('admin can access draft documents', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Admin Draft Test',
        type: 'admin' as const,
      })

      // Create a draft page
      const draftPage = await payload.create({
        collection: 'pages',
        data: {
          title: 'Draft Page for Admin Test',
          content: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Draft content' }],
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          },
        },
        user: { ...admin, collection: 'managers' },
      })

      // Query pages as admin - draft SHOULD appear
      // Note: overrideAccess: false is required to test access control with Local API
      const adminPages = await payload.find({
        collection: 'pages',
        user: { ...admin, collection: 'managers' },
        overrideAccess: false,
      })

      const draftIds = adminPages.docs.map((doc) => doc.id)
      expect(draftIds).toContain(draftPage.id)
    })

    it('applies to meditations collection (another draft-enabled collection)', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Meditation Draft Test',
        type: 'admin' as const,
      })

      // Create a client with wemeditate-web-client role (has access to meditations)
      const client = await testData.createClient(payload, admin.id, {
        name: 'Test API Client for Meditation Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      // Create a draft meditation using testData helper (handles file upload)
      const draftMeditation = await testData.createMeditation(payload, undefined, {
        label: 'Draft Meditation for Client Test',
        locale: 'en',
      })

      expect(draftMeditation._status).toBe('draft')

      // Query meditations as client - draft should NOT appear
      // Note: overrideAccess: false is required to test access control with Local API
      const clientMeditations = await payload.find({
        collection: 'meditations',
        user: client,
        overrideAccess: false,
      })

      const draftIds = clientMeditations.docs.map((doc) => doc.id)
      expect(draftIds).not.toContain(draftMeditation.id)

      // Manager should be able to see the draft
      const manager = await testData.createManager(payload, {
        name: 'Manager for Meditation Draft Test',
        type: 'manager' as const,
        roles: { en: ['meditations-editor'] },
      })

      // Note: overrideAccess: false is required to test access control with Local API
      const managerMeditations = await payload.find({
        collection: 'meditations',
        user: { ...manager, collection: 'managers' },
        overrideAccess: false,
      })

      const managerDraftIds = managerMeditations.docs.map((doc) => doc.id)
      expect(managerDraftIds).toContain(draftMeditation.id)
    })

    it('does not affect non-draft collections', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Non-Draft Test',
        type: 'admin' as const,
      })

      // Create a client
      const client = await testData.createClient(payload, admin.id, {
        name: 'Test API Client for Non-Draft Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      // Create a narrator (not a draft-enabled collection)
      const narrator = await testData.createNarrator(payload, {
        name: 'Test Narrator for Non-Draft Test',
      })

      // Client should be able to access narrators (no draft filtering)
      // Note: overrideAccess: false is required to test access control with Local API
      const clientNarrators = await payload.find({
        collection: 'narrators',
        user: client,
        overrideAccess: false,
      })

      const narratorIds = clientNarrators.docs.map((doc) => doc.id)
      expect(narratorIds).toContain(narrator.id)
    })
  })
})
