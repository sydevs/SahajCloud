import type { Payload, PayloadRequest } from 'payload'

import fs from 'fs'
import path from 'path'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import { bypassPermissions, hasAnyPermission, hasPermission } from '@/plugins/access'

import { createTestLexicalContent, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

vi.mock('@/lib/lectures/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/lectures/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/metadata-thumb.jpg',
      hlsUrl: 'https://example.com/stream.m3u8',
      subtitles: [],
      duration: null,
    }),
  }
})

function createTrustedPreviewRequest(
  payload: Payload,
  user: PayloadRequest['user'],
): PayloadRequest {
  const headers = new Headers()
  headers.set('x-sahajcloud-preview-secret', process.env.SAHAJCLOUD_PREVIEW_SECRET || '')

  return {
    payload,
    user,
    locale: 'en',
    headers: headers as PayloadRequest['headers'],
  } as PayloadRequest
}

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

  describe('Document-Level Manager Access', () => {
    // A manager (type: 'manager') with no roles — relies purely on being listed
    // on a document (or an ancestor) for access.
    const managerUser = (m: { id: number }) => ({ ...m, collection: 'managers' as const })

    describe('Pages — direct managers ("Page Editors")', () => {
      it('lets a listed manager with no roles read + update the page', async () => {
        const editor = await testData.createManager(payload, { name: 'Page Editor', roles: [] })
        const page = await testData.createPage(payload, {
          title: 'Editable Page',
          managers: [editor.id],
        })

        const read = await payload.findByID({
          collection: 'pages',
          id: page.id,
          user: managerUser(editor),
          overrideAccess: false,
        })
        expect(read.id).toBe(page.id)

        const updated = await payload.update({
          collection: 'pages',
          id: page.id,
          data: { title: 'Edited By Page Editor' },
          user: managerUser(editor),
          overrideAccess: false,
        })
        expect(updated.title).toBe('Edited By Page Editor')
      })

      it('scopes a listed manager to only the pages they manage', async () => {
        const editor = await testData.createManager(payload, { name: 'Scoped Editor', roles: [] })
        const mine = await testData.createPage(payload, {
          title: 'My Page',
          managers: [editor.id],
        })
        const other = await testData.createPage(payload, { title: 'Someone Else Page' })

        const result = await payload.find({
          collection: 'pages',
          user: managerUser(editor),
          overrideAccess: false,
        })
        const ids = result.docs.map((doc) => doc.id)
        expect(ids).toContain(mine.id)
        expect(ids).not.toContain(other.id)
      })

      it('denies a manager not listed on the page', async () => {
        const outsider = await testData.createManager(payload, { name: 'Outsider', roles: [] })
        const page = await testData.createPage(payload, { title: 'Locked Page' })

        await expect(
          payload.findByID({
            collection: 'pages',
            id: page.id,
            user: managerUser(outsider),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
        await expect(
          payload.update({
            collection: 'pages',
            id: page.id,
            data: { title: 'Should Not Save' },
            user: managerUser(outsider),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
      })

      it('does not grant create or delete via the managers field', async () => {
        const editor = await testData.createManager(payload, { name: 'No CRUD Editor', roles: [] })
        const page = await testData.createPage(payload, {
          title: 'No Delete Page',
          managers: [editor.id],
        })

        await expect(
          payload.create({
            collection: 'pages',
            data: { title: 'Editor Created', content: createTestLexicalContent() },
            user: managerUser(editor),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
        await expect(
          payload.delete({
            collection: 'pages',
            id: page.id,
            user: managerUser(editor),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
      })
    })

    describe('Regions — recursive inheritance via breadcrumbs', () => {
      // Non-'manual' mapboxId keeps the conditionally-required coordinate fields
      // out of validation.
      const createRegion = (data: Record<string, unknown>) =>
        payload.create({
          collection: 'regions',
          data: {
            level: 'country',
            name: 'Region',
            mapboxId: `place.${Math.random().toString(36).slice(2)}`,
            ...data,
          },
          depth: 0,
        })

      it('an ancestor manager reaches every descendant but not a sibling branch', async () => {
        // Country → Region → City → Center (the 4-level Atlas tree).
        const country = await createRegion({ level: 'country', name: 'Atlasia' })
        const region = await createRegion({ level: 'region', name: 'North', parent: country.id })
        const city = await createRegion({ level: 'city', name: 'Capital', parent: region.id })
        const center = await createRegion({ level: 'center', name: 'Downtown', parent: city.id })

        // A separate branch the manager must NOT reach.
        const otherCountry = await createRegion({ level: 'country', name: 'Otherland' })
        const otherCenter = await createRegion({
          level: 'center',
          name: 'Far Center',
          parent: otherCountry.id,
        })

        // List the manager on the country root only.
        const mgr = await testData.createManager(payload, { name: 'Country Manager', roles: [] })
        await payload.update({
          collection: 'regions',
          id: country.id,
          data: { managers: [mgr.id] },
        })

        // Reads: every node in the managed subtree resolves; the sibling does not.
        const visible = await payload.find({
          collection: 'regions',
          user: managerUser(mgr),
          overrideAccess: false,
          pagination: false,
        })
        const visibleIds = visible.docs.map((doc) => doc.id)
        expect(visibleIds).toEqual(
          expect.arrayContaining([country.id, region.id, city.id, center.id]),
        )
        expect(visibleIds).not.toContain(otherCenter.id)
        expect(visibleIds).not.toContain(otherCountry.id)

        // Updates: inherited down the whole chain, including the deepest leaf.
        for (const node of [country, region, city, center]) {
          const updated = await payload.update({
            collection: 'regions',
            id: node.id,
            data: { subtitle: 'managed' },
            user: managerUser(mgr),
            overrideAccess: false,
          })
          expect(updated.id).toBe(node.id)
        }

        // The sibling-branch center is denied for both read and update.
        await expect(
          payload.findByID({
            collection: 'regions',
            id: otherCenter.id,
            user: managerUser(mgr),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
        await expect(
          payload.update({
            collection: 'regions',
            id: otherCenter.id,
            data: { subtitle: 'nope' },
            user: managerUser(mgr),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
      })
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
      // lessons and app-cards are only in wemeditate-app; lectures is shared
      // across wemeditate-web and wemeditate-app, so it IS readable here.
      expect(
        hasPermission(
          { user: managerUser, collection: 'lessons', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
      expect(
        hasPermission(
          { user: managerUser, collection: 'app-cards', operation: 'read' },
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

    it('grants read access to app-cards for wemeditate-app-client', () => {
      const appClient = testData.dummyUser('clients', {
        id: 17,
        roles: ['wemeditate-app-client'],
      })

      expect(
        hasPermission(
          { user: appClient, collection: 'app-cards', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)
    })

    it('denies read access to app-cards for wemeditate-web-client', () => {
      const webClient = testData.dummyUser('clients', {
        id: 18,
        roles: ['wemeditate-web-client'],
      })

      expect(
        hasPermission(
          { user: webClient, collection: 'app-cards', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)
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
          content: createTestLexicalContent('Draft content'),
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
        select: { id: true },
        depth: 0,
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
          content: createTestLexicalContent('Draft content'),
        },
        user: { ...admin, collection: 'managers' },
      })

      // Attempt to access by ID as client - should throw NotFound due to query constraint
      // Note: overrideAccess: false is required to test access control with Local API
      await expect(
        payload.findByID({
          collection: 'pages',
          id: draftPage.id,
          select: { id: true },
          depth: 0,
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
          content: createTestLexicalContent('Published content'),
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
        select: { id: true },
        depth: 0,
        user: client,
        overrideAccess: false,
      })

      const publishedIds = clientPages.docs.map((doc) => doc.id)
      expect(publishedIds).toContain(publishedPage.id)

      // Also test findByID
      const foundPage = await payload.findByID({
        collection: 'pages',
        id: publishedPage.id,
        select: { id: true },
        depth: 0,
        user: client,
        overrideAccess: false,
      })

      expect(foundPage).not.toBeNull()
      expect(foundPage?.id).toBe(publishedPage.id)
    })

    it('client can access draft page by ID for trusted preview requests', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for Preview Draft Page Test',
        type: 'admin' as const,
      })

      const client = await testData.createClient(payload, admin.id, {
        name: 'Preview Client for Draft Page Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      const draftPage = await payload.create({
        collection: 'pages',
        data: {
          title: 'Draft Page for Trusted Preview',
          content: createTestLexicalContent('Draft preview content'),
        },
        user: { ...admin, collection: 'managers' },
      })

      const previewReq = createTrustedPreviewRequest(
        payload,
        client as unknown as PayloadRequest['user'],
      )

      const foundPage = await payload.findByID({
        collection: 'pages',
        id: draftPage.id,
        draft: true,
        select: { _status: true },
        depth: 0,
        user: client,
        req: previewReq,
        overrideAccess: false,
      })

      expect(foundPage.id).toBe(draftPage.id)
      expect(foundPage._status).toBe('draft')
    })

    it('wemeditate-app-client can read published app-cards', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for App Cards Test',
        type: 'admin' as const,
      })
      const client = await testData.createClient(payload, admin.id, {
        name: 'App Client for Cards Test',
        roles: ['wemeditate-app-client'],
        active: true,
      })

      const publishedCard = await testData.createAppCard(payload, {
        label: 'Published Card for Client Test',
        _status: 'published',
      })
      const draftCard = await testData.createAppCard(payload, {
        label: 'Draft Card for Client Test',
        _status: 'draft',
      })

      const clientCards = await payload.find({
        collection: 'app-cards',
        select: { id: true },
        depth: 0,
        user: client,
        overrideAccess: false,
      })

      const ids = clientCards.docs.map((doc) => doc.id)
      expect(ids).toContain(publishedCard.id)
      expect(ids).not.toContain(draftCard.id)
    })

    it('wemeditate-web-client cannot read app-cards', async () => {
      // Create admin manager
      const admin = await testData.createManager(payload, {
        name: 'Admin for Web Client Cards Test',
        type: 'admin' as const,
      })

      // Create a client with wemeditate-web-client role (no app-cards access)
      const client = await testData.createClient(payload, admin.id, {
        name: 'Web Client for Cards Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      // Attempt to list app-cards as web client - should throw Forbidden
      await expect(
        payload.find({
          collection: 'app-cards',
          select: { id: true },
          user: client,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    describe('App content collection reads', () => {
      it('wemeditate-app-client can read lectures through normal RBAC', async () => {
        const admin = await testData.createManager(payload, {
          name: 'Admin for Lectures Read Test',
          type: 'admin' as const,
        })
        const client = await testData.createClient(payload, admin.id, {
          name: 'App Client for Lectures Read Test',
          roles: ['wemeditate-app-client'],
          active: true,
        })

        const lecture = await testData.createLecture(payload, undefined, {
          title: 'Published Lecture for Client RBAC Test',
        })

        const result = await payload.find({
          collection: 'lectures',
          select: { id: true },
          depth: 0,
          user: client,
          overrideAccess: false,
        })

        expect(result).toBeDefined()
        expect(Array.isArray(result.docs)).toBe(true)
        expect(result.docs.map((doc) => doc.id)).toContain(lecture.id)
      })
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
          content: createTestLexicalContent('Draft content'),
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
          content: createTestLexicalContent('Draft content'),
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
        select: { id: true },
        depth: 0,
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

    it('client can access draft meditation by ID for trusted preview requests', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for Preview Draft Meditation Test',
        type: 'admin' as const,
      })

      const client = await testData.createClient(payload, admin.id, {
        name: 'Preview Client for Draft Meditation Test',
        roles: ['wemeditate-web-client'],
        active: true,
      })

      const draftMeditation = await testData.createMeditation(payload, undefined, {
        label: 'Draft Meditation for Trusted Preview',
        locale: 'en',
      })

      const previewReq = createTrustedPreviewRequest(
        payload,
        client as unknown as PayloadRequest['user'],
      )

      const foundMeditation = await payload.findByID({
        collection: 'meditations',
        id: draftMeditation.id,
        draft: true,
        select: { _status: true },
        depth: 0,
        user: client,
        req: previewReq,
        overrideAccess: false,
      })

      expect(foundMeditation.id).toBe(draftMeditation.id)
      expect(foundMeditation._status).toBe('draft')
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
        select: { id: true },
        depth: 0,
        user: client,
        overrideAccess: false,
      })

      const narratorIds = clientNarrators.docs.map((doc) => doc.id)
      expect(narratorIds).toContain(narrator.id)
    })
  })

  describe('User Choices (user-choices) Access', () => {
    it('grants meditations-editor update access but not create or delete on user-choices', () => {
      const editorUser = testData.dummyUser('managers', {
        id: 200,
        roles: ['meditations-editor'],
      })

      // Implicit read via wemeditate-app project membership
      expect(
        hasPermission(
          { user: editorUser, collection: 'user-choices', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)

      // Explicit update
      expect(
        hasPermission(
          { user: editorUser, collection: 'user-choices', operation: 'update' },
          bypassPermissions,
        ),
      ).toBe(true)

      // No create or delete — editors can only edit existing tag assignments
      expect(
        hasPermission(
          { user: editorUser, collection: 'user-choices', operation: 'create' },
          bypassPermissions,
        ),
      ).toBe(false)
      expect(
        hasPermission(
          { user: editorUser, collection: 'user-choices', operation: 'delete' },
          bypassPermissions,
        ),
      ).toBe(false)
    })

    it('allows meditations-editor to update per-timing meditation fields but strips edits to other fields', async () => {
      // Seed tag with known admin-authored values
      const tag = await testData.createUserChoice(payload, {
        title: 'Original Category Title',
        color: '#AA0000',
        order: 5,
        isFeatured: true,
        timings: ['morning'],
      })

      const meditation = await testData.createMeditation(payload, undefined, {
        label: 'Seed Morning Meditation',
        locale: 'en',
        type: 'daily',
      })

      const editor = await testData.createManager(payload, {
        name: 'Editor for Field-Level Access Test',
        roles: { en: ['meditations-editor'] },
      })

      // Editor attempts to change title/color/order AND set morningMeditation.
      // Field-level access should silently drop the non-allowed edits.
      await payload.update({
        collection: 'user-choices',
        id: tag.id,
        data: {
          morningMeditation: meditation.id,
          title: 'Hijacked Title',
          color: '#00FF00',
          order: 99,
          isFeatured: false,
        },
        user: { ...editor, collection: 'managers' },
        overrideAccess: false,
      })

      const updated = await payload.findByID({
        collection: 'user-choices',
        id: tag.id,
        depth: 0,
      })

      // Allowed: morningMeditation updated
      expect(updated.morningMeditation).toBe(meditation.id)

      // Blocked: admin-authored fields unchanged
      expect(updated.title).toBe('Original Category Title')
      expect(updated.color).toBe('#AA0000')
      expect(updated.order).toBe(5)
      expect(updated.isFeatured).toBe(true)
    })

    it('allows admin managers to update any field on user-choices', async () => {
      const tag = await testData.createUserChoice(payload, {
        title: 'Admin-Editable Tag',
        color: '#112233',
        order: 10,
      })

      const admin = await testData.createManager(payload, {
        name: 'Admin for Field-Level Access Test',
        type: 'admin' as const,
      })

      await payload.update({
        collection: 'user-choices',
        id: tag.id,
        data: {
          title: 'Updated by Admin',
          color: '#445566',
          order: 20,
        },
        user: { ...admin, collection: 'managers' },
        overrideAccess: false,
      })

      const updated = await payload.findByID({
        collection: 'user-choices',
        id: tag.id,
        depth: 0,
      })

      expect(updated.title).toBe('Updated by Admin')
      expect(updated.color).toBe('#445566')
      expect(updated.order).toBe(20)
    })

    it('blocks meditations-editor from replacing the uploaded icon', async () => {
      const tag = await testData.createUserChoice(payload, { title: 'Locked Icon Tag' })

      const editor = await testData.createManager(payload, {
        name: 'Editor for Icon Replace Block Test',
        roles: { en: ['meditations-editor'] },
      })

      const replacementBuffer = fs.readFileSync(path.join(SAMPLE_FILES_DIR, 'icon-test.svg'))

      await expect(
        payload.update({
          collection: 'user-choices',
          id: tag.id,
          data: {},
          file: {
            data: replacementBuffer,
            mimetype: 'image/svg+xml',
            name: 'replacement.svg',
            size: replacementBuffer.length,
          },
          user: { ...editor, collection: 'managers' },
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: expect.stringMatching(/Only admins can replace the icon/),
      })
    })
  })

  describe('Slug field access', () => {
    // Use user-choices as the test collection: meditations-editor has explicit
    // update permission on it, and its update path has no blocking validation.
    it('prevents non-admin editors from changing a slug on update', async () => {
      const tag = await testData.createUserChoice(payload, { title: 'Slug Lock Test Tag' })
      const originalSlug = tag.slug

      const editor = await testData.createManager(payload, {
        name: 'Editor for Slug Lock Test',
        roles: { en: ['meditations-editor'] },
      })

      // Note: overrideAccess: false is required to test access control with Local API
      await payload.update({
        collection: 'user-choices',
        id: tag.id,
        data: { slug: 'should-not-change', generateSlug: false },
        user: { ...editor, collection: 'managers' },
        overrideAccess: false,
      })

      const refetched = await payload.findByID({ collection: 'user-choices', id: tag.id })
      expect(refetched.slug).toBe(originalSlug)
    })

    it('allows admin to change a slug', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for Slug Change Test',
        type: 'admin' as const,
      })

      const tag = await testData.createUserChoice(payload, { title: 'Admin Slug Change Tag' })

      // Note: overrideAccess: false is required to test access control with Local API
      await payload.update({
        collection: 'user-choices',
        id: tag.id,
        data: { slug: 'admin-changed-slug', generateSlug: false },
        user: { ...admin, collection: 'managers' },
        overrideAccess: false,
      })

      const refetched = await payload.findByID({ collection: 'user-choices', id: tag.id })
      expect(refetched.slug).toBe('admin-changed-slug')
    })
  })
})
