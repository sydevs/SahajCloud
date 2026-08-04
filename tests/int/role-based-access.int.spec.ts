import type { Payload, PayloadRequest } from 'payload'

import fs from 'fs'
import path from 'path'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Event, Region } from '@/payload-types'
import { bypassPermissions, hasAnyPermission, hasPermission } from '@/plugins/access'

import {
  createData,
  createTestLexicalContent,
  testData,
  type FixtureOverrides,
} from '../utils/testData'
import { createTestEnvironment, idOnlySelect } from '../utils/testHelpers'

/**
 * Region fixture data — the whole doc, loosely: every field optional at every
 * depth, but each one that *is* passed checked against the real collection.
 * Replaces the `Record<string, unknown>` these helpers used to take, which is
 * how `level: 'center'` survived the rename to `venue` and surfaced only as a
 * CI runtime failure.
 *
 * As of #606 Phase 2 this is a live guard, not just editor feedback:
 * `tsconfig.test.json` covers `tests/**`, so `pnpm typecheck:tests` reads this
 * file and a stale enum literal fails in seconds rather than 7 minutes into the
 * int lane.
 */
type RegionFixture = FixtureOverrides<Region>

/** A manager fixture; `testData.createManager` already attaches `collection`. */
type ManagerFixture = Awaited<ReturnType<typeof testData.createManager>>

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
    const managerUser = (m: ManagerFixture) => ({ ...m, collection: 'managers' as const })

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
            data: createData<'pages'>({
              title: 'Editor Created',
              content: createTestLexicalContent(),
            }),
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
      let fillerManagerId: number
      beforeAll(async () => {
        const filler = await testData.createManager(payload, {
          name: 'Filler Region Manager',
          roles: [],
        })
        fillerManagerId = filler.id
      })

      const createRegion = (data: RegionFixture) =>
        payload.create({
          collection: 'regions',
          data: createData<'regions'>({
            level: 'country',
            name: 'Region',
            mapboxId: `place.${Math.random().toString(36).slice(2)}`,
            managers: [fillerManagerId],
            ...data,
          }),
          depth: 0,
        })

      it('an ancestor manager reaches every descendant but not a sibling branch', async () => {
        // Country → Region → City → Venue (the 4-level Atlas tree).
        const country = await createRegion({ level: 'country', name: 'Atlasia' })
        const region = await createRegion({ level: 'region', name: 'North', parent: country.id })
        const city = await createRegion({ level: 'city', name: 'Capital', parent: region.id })
        const venue = await createRegion({ level: 'venue', name: 'Downtown', parent: city.id })

        // A separate branch the manager must NOT reach. (A venue nests only
        // under a city, so the branch goes country → city → venue.)
        const otherCountry = await createRegion({ level: 'country', name: 'Otherland' })
        const otherCity = await createRegion({
          level: 'city',
          name: 'Far City',
          parent: otherCountry.id,
        })
        const otherVenue = await createRegion({
          level: 'venue',
          name: 'Far Venue',
          parent: otherCity.id,
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
          expect.arrayContaining([country.id, region.id, city.id, venue.id]),
        )
        expect(visibleIds).not.toContain(otherVenue.id)
        expect(visibleIds).not.toContain(otherCountry.id)

        // Updates: inherited down the whole chain, including the deepest leaf.
        for (const node of [country, region, city, venue]) {
          const updated = await payload.update({
            collection: 'regions',
            id: node.id,
            data: { subtitle: 'managed' },
            user: managerUser(mgr),
            overrideAccess: false,
          })
          expect(updated.id).toBe(node.id)
        }

        // The sibling-branch venue is denied for both read and update.
        await expect(
          payload.findByID({
            collection: 'regions',
            id: otherVenue.id,
            user: managerUser(mgr),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
        await expect(
          payload.update({
            collection: 'regions',
            id: otherVenue.id,
            data: { subtitle: 'nope' },
            user: managerUser(mgr),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
      })
    })
  })

  describe('Atlas manager — region-subtree write scoping', () => {
    const managerUser = (m: ManagerFixture) => ({ ...m, collection: 'managers' as const })

    let atlasManager: Awaited<ReturnType<typeof testData.createManager>>
    let fillerId: number
    let countryId: number
    let regionId: number
    let cityId: number
    let venueId: number
    let otherCountryId: number
    let otherVenueId: number

    // Non-'manual' mapboxId keeps the conditionally-required coordinate fields out
    // of validation. Pass a `user` to exercise access (overrideAccess: false);
    // omit it to set up fixtures as admin.
    const createRegion = (data: RegionFixture, user?: ManagerFixture) =>
      payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          level: 'country',
          name: 'Region',
          mapboxId: `place.${Math.random().toString(36).slice(2)}`,
          managers: [fillerId],
          ...data,
        }),
        depth: 0,
        ...(user ? { user: managerUser(user), overrideAccess: false } : { overrideAccess: true }),
      })

    const createEvent = (data: FixtureOverrides<Event>, user?: ManagerFixture) =>
      payload.create({
        collection: 'events',
        // draft: the now-required title/schedule are validated only on publish.
        draft: true,
        data: createData<'events'>({
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: fillerId,
          ...data,
        }),
        depth: 0,
        ...(user ? { user: managerUser(user), overrideAccess: false } : { overrideAccess: true }),
      })

    beforeAll(async () => {
      const filler = await testData.createManager(payload, { name: 'Atlas Filler', roles: [] })
      fillerId = filler.id
      atlasManager = await testData.createManager(payload, {
        name: 'Atlas Manager',
        roles: ['atlas-manager'],
      })

      // country > region (owned) > city > venue, plus a separate branch.
      // Distinct names from the sibling describe block (slugs are unique).
      const country = await createRegion({ level: 'country', name: 'AtlasMgr Country' })
      countryId = country.id
      const region = await createRegion({
        level: 'region',
        name: 'AtlasMgr Region',
        parent: countryId,
        managers: [atlasManager.id],
      })
      regionId = region.id
      const city = await createRegion({ level: 'city', name: 'AtlasMgr City', parent: regionId })
      cityId = city.id
      const venue = await createRegion({
        level: 'venue',
        name: 'AtlasMgr Venue',
        parent: cityId,
      })
      venueId = venue.id

      const otherCountry = await createRegion({ level: 'country', name: 'AtlasMgr Otherland' })
      otherCountryId = otherCountry.id
      const otherCity = await createRegion({
        level: 'city',
        name: 'AtlasMgr Far City',
        parent: otherCountryId,
      })
      const otherVenue = await createRegion({
        level: 'venue',
        name: 'AtlasMgr Far Venue',
        parent: otherCity.id,
      })
      otherVenueId = otherVenue.id
    })

    it('exposes the role as project-scoped: read everywhere, write only on events/regions', () => {
      const user = managerUser(atlasManager)
      // Project-wide implicit read across the Atlas collections.
      for (const collection of ['events', 'regions', 'registrations'] as const) {
        expect(hasPermission({ user, collection, operation: 'read' }, bypassPermissions)).toBe(true)
      }
      // Role grants events CUD and regions CU (scoped at the access layer); no
      // region delete, and nothing on unrelated collections.
      expect(
        hasPermission({ user, collection: 'events', operation: 'delete' }, bypassPermissions),
      ).toBe(true)
      expect(
        hasPermission({ user, collection: 'regions', operation: 'update' }, bypassPermissions),
      ).toBe(true)
      expect(
        hasPermission({ user, collection: 'regions', operation: 'delete' }, bypassPermissions),
      ).toBe(false)
      expect(
        hasPermission({ user, collection: 'meditations', operation: 'update' }, bypassPermissions),
      ).toBe(false)
    })

    it('reads regions and events project-wide, not just within its subtree', async () => {
      const region = await payload.findByID({
        collection: 'regions',
        id: otherCountryId,
        user: managerUser(atlasManager),
        overrideAccess: false,
      })
      expect(region.id).toBe(otherCountryId)

      const event = await createEvent({ region: otherVenueId, address: { street: 'Far' } })
      const seen = await payload.findByID({
        collection: 'events',
        id: event.id,
        user: managerUser(atlasManager),
        overrideAccess: false,
      })
      expect(seen.id).toBe(event.id)
    })

    it('updates regions within its subtree, but not a sibling branch or an ancestor', async () => {
      const updated = await payload.update({
        collection: 'regions',
        id: cityId,
        data: { subtitle: 'mine' },
        user: managerUser(atlasManager),
        overrideAccess: false,
      })
      expect(updated.id).toBe(cityId)

      for (const id of [otherVenueId, countryId]) {
        await expect(
          payload.update({
            collection: 'regions',
            id,
            data: { subtitle: 'nope' },
            user: managerUser(atlasManager),
            overrideAccess: false,
          }),
        ).rejects.toThrow()
      }
    })

    it('creates a sub-region only beneath a region it owns', async () => {
      const created = await createRegion(
        { level: 'city', name: 'AtlasMgr New City', parent: regionId },
        atlasManager,
      )
      expect(created.id).toBeDefined()

      await expect(
        createRegion(
          { level: 'city', name: 'AtlasMgr Nope', parent: otherCountryId },
          atlasManager,
        ),
      ).rejects.toThrow()
    })

    it('cannot create a root region (no parent) — only children of owned regions', async () => {
      await expect(
        createRegion({ level: 'country', name: 'AtlasMgr Rogue Country' }, atlasManager),
      ).rejects.toThrow()
    })

    it('lets admins create root regions despite the create hook', async () => {
      const admin = await testData.createManager(payload, {
        name: 'AtlasMgr Admin',
        type: 'admin' as const,
      })
      const created = await createRegion(
        { level: 'country', name: 'AtlasMgr Admin Country' },
        admin,
      )
      expect(created.id).toBeDefined()
    })

    it('cannot delete regions (admin-only)', async () => {
      await expect(
        payload.delete({
          collection: 'regions',
          id: cityId,
          user: managerUser(atlasManager),
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('creates events only within its subtree', async () => {
      const created = await createEvent(
        { region: venueId, address: { street: 'Inside' } },
        atlasManager,
      )
      expect(created.id).toBeDefined()

      await expect(
        createEvent({ region: otherVenueId, address: { street: 'Outside' } }, atlasManager),
      ).rejects.toThrow()
    })

    it('updates and trashes events within its subtree, but not outside', async () => {
      const inside = await createEvent({ region: cityId, address: { street: 'In' } })
      const outside = await createEvent({ region: otherVenueId, address: { street: 'Out' } })

      const updated = await payload.update({
        collection: 'events',
        id: inside.id,
        draft: true,
        data: { address: { street: 'In edited' } },
        user: managerUser(atlasManager),
        overrideAccess: false,
      })
      expect(updated.id).toBe(inside.id)

      await expect(
        payload.update({
          collection: 'events',
          id: outside.id,
          draft: true,
          data: { address: { street: 'no' } },
          user: managerUser(atlasManager),
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // The `delete` op (permanent delete / the trash button's hard path) is
      // scoped the same way: allowed inside, denied outside. Soft-delete via an
      // `update` to `deletedAt` is covered by the update assertions above.
      const trashed = await payload.delete({
        collection: 'events',
        id: inside.id,
        user: managerUser(atlasManager),
        overrideAccess: false,
      })
      expect(trashed.id).toBe(inside.id)

      await expect(
        payload.delete({
          collection: 'events',
          id: outside.id,
          user: managerUser(atlasManager),
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('keeps write access to an event it directly manages, even outside its subtree', async () => {
      const owned = await createEvent({
        region: otherVenueId,
        manager: atlasManager.id,
        address: { street: 'Owned' },
      })
      const updated = await payload.update({
        collection: 'events',
        id: owned.id,
        draft: true,
        data: { address: { street: 'Owner edit' } },
        user: managerUser(atlasManager),
        overrideAccess: false,
      })
      expect(updated.id).toBe(owned.id)
    })

    it('rejects re-homing an in-subtree event to a region outside the subtree', async () => {
      const inside = await createEvent({ region: cityId, address: { street: 'Stay put' } })
      await expect(
        payload.update({
          collection: 'events',
          id: inside.id,
          draft: true,
          data: { region: otherVenueId },
          user: managerUser(atlasManager),
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('rejects re-parenting an owned region under one it does not own', async () => {
      await expect(
        payload.update({
          collection: 'regions',
          id: cityId,
          data: { parent: otherCountryId },
          user: managerUser(atlasManager),
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('cannot create an event when it owns no region', async () => {
      const regionlessManager = await testData.createManager(payload, {
        name: 'Region-less Atlas Manager',
        roles: ['atlas-manager'],
      })
      // Owns no region → its subtree is empty → no region is valid to create in.
      await expect(
        createEvent({ region: cityId, address: { street: 'Nope' } }, regionlessManager),
      ).rejects.toThrow()
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
      ] as const

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
        _status: 'published',
      })

      // Create a draft page (default status is draft)
      const draftPage = await payload.create({
        collection: 'pages',
        data: createData<'pages'>({
          title: 'Draft Page for Client Test',
          content: createTestLexicalContent('Draft content'),
        }),
        user: { ...admin, collection: 'managers' },
      })

      expect(draftPage._status).toBe('draft')

      // Verify client object has collection property set correctly
      expect(client.collection).toBe('clients')

      // Query pages as client - draft should NOT appear
      // Note: overrideAccess: false is required to test access control with Local API
      const clientPages = await payload.find({
        collection: 'pages',
        select: idOnlySelect(),
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
        _status: 'published',
      })

      // Create a draft page
      const draftPage = await payload.create({
        collection: 'pages',
        data: createData<'pages'>({
          title: 'Draft Page for ID Test',
          content: createTestLexicalContent('Draft content'),
        }),
        user: { ...admin, collection: 'managers' },
      })

      // Attempt to access by ID as client - should throw NotFound due to query constraint
      // Note: overrideAccess: false is required to test access control with Local API
      await expect(
        payload.findByID({
          collection: 'pages',
          id: draftPage.id,
          select: idOnlySelect(),
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
        _status: 'published',
      })

      // Create and publish a page
      const draftPage = await payload.create({
        collection: 'pages',
        data: createData<'pages'>({
          title: 'Page to Publish',
          content: createTestLexicalContent('Published content'),
        }),
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
        select: idOnlySelect(),
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
        select: idOnlySelect(),
        depth: 0,
        user: client,
        overrideAccess: false,
      })

      expect(foundPage).not.toBeNull()
      expect(foundPage?.id).toBe(publishedPage.id)
    })

    it('denies an unpublished (draft) client entirely (publish-gated auth)', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for Draft Client Gate Test',
        type: 'admin' as const,
      })

      // The draft client carries a role that would normally grant page reads...
      const draftClient = await testData.createClient(payload, admin.id, {
        name: 'Draft (unpublished) API Client',
        roles: ['wemeditate-web-client'],
        _status: 'draft',
      })
      expect(draftClient._status).toBe('draft')

      // ...but publish/unpublish is the auth gate, so the bypass denies it.
      expect(
        hasPermission(
          { user: draftClient, collection: 'pages', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(false)

      // A published page is therefore unreadable by the draft client.
      await payload.create({
        collection: 'pages',
        data: createData<'pages'>({
          title: 'Published Page Hidden From Draft Client',
          content: createTestLexicalContent('content'),
          _status: 'published',
        }),
        user: { ...admin, collection: 'managers' },
      })

      await expect(
        payload.find({
          collection: 'pages',
          select: idOnlySelect(),
          depth: 0,
          user: draftClient,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('client can access draft page by ID for trusted preview requests', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for Preview Draft Page Test',
        type: 'admin' as const,
      })

      const client = await testData.createClient(payload, admin.id, {
        name: 'Preview Client for Draft Page Test',
        roles: ['wemeditate-web-client'],
        _status: 'published',
      })

      const draftPage = await payload.create({
        collection: 'pages',
        data: createData<'pages'>({
          title: 'Draft Page for Trusted Preview',
          content: createTestLexicalContent('Draft preview content'),
        }),
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
        _status: 'published',
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
        select: idOnlySelect(),
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
        _status: 'published',
      })

      // Attempt to list app-cards as web client - should throw Forbidden
      await expect(
        payload.find({
          collection: 'app-cards',
          select: idOnlySelect(),
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
          _status: 'published',
        })

        const lecture = await testData.createLecture(payload, undefined, {
          title: 'Published Lecture for Client RBAC Test',
        })

        const result = await payload.find({
          collection: 'lectures',
          select: idOnlySelect(),
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
        data: createData<'pages'>({
          title: 'Draft Page for Manager Test',
          content: createTestLexicalContent('Draft content'),
        }),
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
        data: createData<'pages'>({
          title: 'Draft Page for Admin Test',
          content: createTestLexicalContent('Draft content'),
        }),
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
        _status: 'published',
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
        select: idOnlySelect(),
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
        _status: 'published',
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
        _status: 'published',
      })

      // Create a narrator (not a draft-enabled collection)
      const narrator = await testData.createNarrator(payload, {
        name: 'Test Narrator for Non-Draft Test',
      })

      // Client should be able to access narrators (no draft filtering)
      // Note: overrideAccess: false is required to test access control with Local API
      const clientNarrators = await payload.find({
        collection: 'narrators',
        select: idOnlySelect(),
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
