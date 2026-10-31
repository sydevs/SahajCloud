/**
 * No API client reads a manager's name or email address (#821).
 *
 * `managers` sat in no project, which implicit read treats as *shared* rather
 * than restrictive, so every published key — the Atlas widget's browser key
 * included — read every manager's name and address, directly and through every
 * `relationTo: 'managers'` populate. Two fields on `events` hold a manager's
 * address as a *value* instead, which no collection-level rule reaches.
 *
 * Every read runs through `overrideAccess: false`, because a collection's own
 * `access` block outranks the generated one: `hasPermission` can answer
 * "denied" while the composed config still serves rows. The one `hasPermission`
 * case is about role *configuration*, which is what a predicate is right for.
 *
 * ⚠ **A client read is refused for two different reasons, and only one is this
 * ticket's.** The usage plugin rejects a client read carrying no `select` with
 * a 400 before access runs, so a bare `rejects.toThrow()` would go green
 * against a wide-open collection. The refusals assert a 403 specifically.
 */
import type { Payload, PayloadRequest, Where } from 'payload'

import { docAccessOperation } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { buildReminderEntry } from '@/lib/eventVerification/log'
import type { Client, Event, Manager, Region } from '@/payload-types'
import { bypassPermissions, hasPermission, readLockOf } from '@/plugins/access'

import { testData } from '../utils/testData'
import {
  createClientAuthenticatedRequest,
  createTestEnvironment,
  idOnlySelect,
} from '../utils/testHelpers'

/** A manager's address, seeded on the event, that no client may read back. */
const NOTIFICATION_EMAIL = 'registrations-go-here@example.com'
/** The seeker-facing address on the same event, which must survive the locks. */
const PUBLIC_EMAIL = 'ask-us-anything@example.com'
/** A manager's address inside the activity log's reminder history. */
const REMINDER_DESTINATION = 'reminded-manager@example.com'

describe('Managers access (#821)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUser: Manager
  let eventManager: Manager
  let atlasManager: Manager
  let client: Client
  let event: Event
  let region: Region

  /** A client request, as API-key auth builds one. The key is unused: no read below goes over REST. */
  const clientReq = (): PayloadRequest => {
    const base = createClientAuthenticatedRequest(client.id, 'unused', ['sahaj-atlas-client'])
    return { ...base, payload, context: {} } as unknown as PayloadRequest
  }

  const managerReq = (manager: Manager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      context: {},
      locale: 'en',
      user: { ...manager, collection: 'managers' },
    }) as unknown as PayloadRequest

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUser = env.adminUser

    eventManager = await testData.createManager(payload, {
      name: 'Event Manager',
      email: 'event-manager@example.com',
      roles: ['atlas-manager'],
      // Every locked field carries a value, so the field-lock read-backs below
      // assert a deletion rather than an empty column. The three machine
      // columns are `update: () => false`, which a create does not consult.
      language: 'en',
      contactDetails: [{ platform: 'whatsapp', identifier: '+15550000001', verified: true }],
      notificationPreferences: { event_verification: { frequency: 'Monthly', method: 'email' } },
      lastRegistrationDigestSentAt: new Date().toISOString(),
      legacyId: 4242,
      legacyData: { phone: '+15550000001' },
      magicLinkIssuedAt: new Date().toISOString(),
      // Seeded so the column is non-null even if nothing assigns this manager.
      // The invitation queue rewrites both when the region below names them.
      pendingInvitation: { regions: [1] },
      invitationDueAt: new Date().toISOString(),
    })
    atlasManager = await testData.createManager(payload, {
      name: 'Atlas Manager',
      email: 'atlas-manager@example.com',
      roles: ['atlas-manager'],
      // The self-read case asserts these come back, so they have to be set.
      contactDetails: [{ platform: 'telegram', identifier: '@atlas-manager' }],
      notificationPreferences: { invitation: { frequency: 'Never' } },
    })

    region = await testData.createRegion(payload, {
      name: 'Managed City',
      managers: [eventManager.id],
    })
    event = await testData.createEvent(payload, {
      title: 'Managed Event',
      manager: eventManager.id,
      region: region.id,
      registrationMode: 'sahaj-atlas',
      registrationNotificationEmail: NOTIFICATION_EMAIL,
      contactEmail: PUBLIC_EMAIL,
      _status: 'published',
    })
    // Written after the create, under `skipVerifyHook` — `syncVerificationOnSave`
    // RESETS `activityLog` to a single `re-save` entry on any managed save, so
    // a log passed to the create, or written without the flag, is discarded and
    // the assertion below would pass vacuously. Built through the real
    // `buildReminderEntry`, so the fixture carries production's shape rather
    // than a guess at it: `destination` is the field holding the address.
    await payload.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      context: { skipVerifyHook: true },
      data: {
        activityLog: [
          buildReminderEntry({
            stage: 'verified',
            level: 'due',
            role: 'manager',
            manager: { id: eventManager.id, name: eventManager.name },
            channel: 'email',
            destination: REMINDER_DESTINATION,
            at: new Date().toISOString(),
          }),
        ],
      } as never,
    })
    client = await testData.createClient(payload, eventManager.id, {
      name: 'Atlas Widget Key',
      roles: ['sahaj-atlas-client'],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the fixtures carry what the assertions look for', () => {
    it('attaches a manager to the event, the region and the client', async () => {
      const [readEvent, readRegion, readClient] = await Promise.all([
        payload.findByID({ collection: 'events', id: event.id, depth: 1 }),
        payload.findByID({ collection: 'regions', id: region.id, depth: 1 }),
        payload.findByID({ collection: 'clients', id: client.id, depth: 1 }),
      ])

      expect((readEvent.manager as Manager).email).toBe('event-manager@example.com')
      expect((readRegion.managers as Manager[])[0]!.email).toBe('event-manager@example.com')
      expect((readClient.managers as Manager[])[0]!.email).toBe('event-manager@example.com')
      expect((readClient.primaryContact as Manager).email).toBe('event-manager@example.com')
      expect(readEvent.registrationNotificationEmail).toBe(NOTIFICATION_EMAIL)
      expect(JSON.stringify(readEvent.activityLog)).toContain(REMINDER_DESTINATION)
    })
  })

  // Every read is a list, not a `findByID`: a widget reads collections, and
  // `GET /api/<collection>` is the shape the exposure was reported against. The
  // one exception is the client's own row, where #822 left no list to read.
  describe('a published client key', () => {
    it('reads no manager row at all', async () => {
      // 403, not 400: a bare rejection would also be satisfied by the usage
      // plugin's select gate, which fires before access is consulted.
      await expect(
        payload.find({
          collection: 'managers',
          select: idOnlySelect(),
          depth: 0,
          overrideAccess: false,
          req: clientReq(),
        }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('gets a bare id, not a manager, from an event at depth 1', async () => {
      const { docs } = await payload.find({
        collection: 'events',
        select: { title: true, manager: true },
        depth: 1,
        overrideAccess: false,
        req: clientReq(),
      })

      const managed = docs.find((doc) => doc.id === event.id)
      expect(managed).toBeDefined()
      expect(managed!.manager).toBe(eventManager.id)
    })

    it('gets bare ids, not managers, from a region at depth 1', async () => {
      const { docs } = await payload.find({
        collection: 'regions',
        select: { name: true, managers: true },
        depth: 1,
        overrideAccess: false,
        req: clientReq(),
      })

      const managed = docs.find((doc) => doc.id === region.id)
      expect(managed).toBeDefined()
      expect(managed!.managers).toEqual([eventManager.id])
    })

    it('reads no client row at all', async () => {
      await expect(
        payload.find({
          collection: 'clients',
          select: idOnlySelect(),
          depth: 0,
          overrideAccess: false,
          req: clientReq(),
        }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('gets bare ids, not managers, from its own row at depth 1', async () => {
      // The one read in this block that is not a list. #822 restricted
      // `clients`, so the list above is refused and self-access is all that is
      // left — the path `GET /api/clients/me` takes at every widget boot. What
      // the key must not read there is who runs its own service.
      const self = (await payload.findByID({
        collection: 'clients',
        id: client.id,
        select: { name: true, managers: true, primaryContact: true },
        depth: 1,
        overrideAccess: false,
        req: clientReq(),
      })) as Client

      expect(self.managers).toEqual([eventManager.id])
      expect(self.primaryContact).toBe(eventManager.id)
    })

    it('gets no registrationNotificationEmail, even asking for it by name', async () => {
      // Restricting the collection cannot reach this one: the field is a copy
      // of a manager's address, not a relationship to the manager.
      const { docs } = await payload.find({
        collection: 'events',
        select: { title: true, registrationNotificationEmail: true },
        depth: 0,
        overrideAccess: false,
        req: clientReq(),
      })

      const managed = docs.find((doc) => doc.id === event.id)
      expect(managed).toBeDefined()
      expect(managed!.registrationNotificationEmail).toBeUndefined()
    })

    it('still reads contactEmail, which is public by design', async () => {
      // The contrast the two locks above lean on: this is the address a seeker
      // is meant to write to, so it must survive them.
      const { docs } = await payload.find({
        collection: 'events',
        select: { title: true, contactEmail: true },
        depth: 0,
        overrideAccess: false,
        req: clientReq(),
      })
      expect(docs.find((doc) => doc.id === event.id)?.contactEmail).toBe(PUBLIC_EMAIL)
    })

    it('gets no activityLog, where a reminder records the address it went to', async () => {
      const { docs } = await payload.find({
        collection: 'events',
        select: { title: true, activityLog: true },
        depth: 0,
        overrideAccess: false,
        req: clientReq(),
      })

      const managed = docs.find((doc) => doc.id === event.id)
      expect(managed).toBeDefined()
      expect(managed!.activityLog).toBeUndefined()
    })
  })

  describe('client roles', () => {
    it('carry no managers grant, in any role', () => {
      const roles = ['sahaj-atlas-client', 'wemeditate-web-client', 'wemeditate-app-client']
      for (const role of roles) {
        const { user } = createClientAuthenticatedRequest(client.id, 'unused', [role])
        for (const operation of ['read', 'create', 'update', 'delete'] as const) {
          expect(
            hasPermission(
              { user: user as never, collection: 'managers', operation },
              bypassPermissions,
            ),
            `${role} should not ${operation} managers`,
          ).toBe(false)
        }
      }
    })
  })

  // The unit sweep (`tests/unit/manager-field-locks.spec.ts`) reads the config
  // a plugin sees, which is the only place `loginPlugin`'s appended columns
  // exist. It therefore cannot see the auth columns Payload merges in at
  // sanitize, so those are swept here, where the config is the booted one.
  describe('the sanitized collection', () => {
    it('answers "no" for every field but the picker title and the timestamps', async () => {
      // ⚠ **The locks are EVALUATED, not counted.** "Carries a read function"
      // is not the property: the base `_verified` field ships
      // `read: defaultAccess`, which is `Boolean(user)` — a function, and wide
      // open. A sweep that only asked whether a lock existed passed with that
      // field readable by every atlas-manager.
      //
      // `createdAt` / `updatedAt` are Payload's own, appended outside `fields`,
      // so the locker never reaches them — which is why they are named here and
      // not in `MANAGER_PUBLIC_FIELDS`.
      const readable: string[] = []
      for (const field of payload.collections.managers.config.flattenedFields) {
        // A hidden field is dropped from every read unless the caller passes
        // `showHiddenFields`, which no client or picker read does — that is
        // what covers `salt`, `hash` and the reset-password columns.
        if (field.hidden === true) continue
        const lock = readLockOf(field)
        const allowed = lock
          ? await lock({
              id: eventManager.id,
              data: {},
              doc: { id: eventManager.id } as never,
              siblingData: {},
              req: managerReq(atlasManager),
            })
          : true
        if (allowed) readable.push(field.name)
      }

      expect(readable.sort()).toEqual(['createdAt', 'name', 'updatedAt'])
    })

    it('keeps Payload’s own labels on the two base fields it redeclares', () => {
      // ⚠ `sanitizeFields` labels a field from its name BEFORE `mergeBaseFields`
      // runs, and the merge lets ours win — so redeclaring `_verified` bare put
      // a column headed `_verified` in the list view, in every locale.
      const labels = Object.fromEntries(
        payload.collections.managers.config.flattenedFields
          .filter((field) => field.name === 'email' || field.name === '_verified')
          .map((field) => [field.name, field.label]),
      )

      expect(typeof labels.email).toBe('function')
      expect(typeof labels._verified).toBe('function')
    })
  })

  describe('an atlas-manager', () => {
    /** Another manager's row, as the picker's own read returns it. */
    const readOther = async (): Promise<Manager> => {
      const { docs } = await payload.find({
        collection: 'managers',
        depth: 0,
        pagination: false,
        overrideAccess: false,
        req: managerReq(atlasManager),
      })
      const other = docs.find((doc) => doc.id === eventManager.id)
      // The picker lists OTHER managers, so a self-scoped result would be a
      // regression rather than a pass.
      expect(other).toBeDefined()
      return other!
    }

    it('still reads managers, through the explicit grant', async () => {
      // What the `Events.manager` and `Regions.managers` pickers render:
      // `admin.useAsTitle` is `name`, so the grant has to survive the locks.
      expect((await readOther()).name).toBe('Event Manager')
    })

    it('reads nothing on another manager but the title and the timestamps', async () => {
      // ⚠ A denied `array` comes back as `[]`, not absent: access control
      // deletes the key and the array branch then re-assigns an empty array
      // (`payload/dist/fields/hooks/afterRead/promise.js`). `toBeUndefined()`
      // would fail here against a correct implementation.
      const other = await readOther()
      expect(Object.keys(other).sort()).toEqual([
        'collection',
        'contactDetails',
        'createdAt',
        'id',
        'name',
        'sessions',
        'updatedAt',
      ])
      expect(other.contactDetails).toEqual([])
      expect(other.sessions).toEqual([])
    })

    it('reads none of the machine columns on another manager, asking by name', async () => {
      // A `select` is how a caller asks for a field directly rather than
      // taking what a list happens to return.
      const { docs } = await payload.find({
        collection: 'managers',
        select: {
          name: true,
          email: true,
          _verified: true,
          magicLinkIssuedAt: true,
          pendingInvitation: true,
          invitationDueAt: true,
          legacyId: true,
          legacyData: true,
          notificationPreferences: true,
        },
        depth: 0,
        pagination: false,
        overrideAccess: false,
        req: managerReq(atlasManager),
      })

      const other = docs.find((doc) => doc.id === eventManager.id)
      expect(other).toBeDefined()
      expect(Object.keys(other!).sort()).toEqual(['collection', 'id', 'name'])
    })

    it('still reads its own row whole', async () => {
      const self = await payload.findByID({
        collection: 'managers',
        id: atlasManager.id,
        depth: 0,
        overrideAccess: false,
        req: managerReq(atlasManager),
      })

      expect(self.email).toBe('atlas-manager@example.com')
      expect(self.type).toBe('manager')
      // Set on this fixture below, so the key being present is a read and not
      // an empty column.
      expect(self.notificationPreferences).toMatchObject({ invitation: { frequency: 'Never' } })
      expect(self.contactDetails).toHaveLength(1)
    })

    it('is offered its own locked inputs in the admin, and not another row’s', async () => {
      // What the edit view renders from. ⚠ `getEntityPermissions` calls
      // `populateFieldPermissions` with no `id`, only the fetched row as `doc`,
      // so a lock reading `id` alone answers "unreadable" for the holder's own
      // document — and `RenderFields` renders nothing for a field with no read
      // permission, which would leave this manager's Contact tab empty.
      const readableOn = async (id: number, names: string[]): Promise<string[]> => {
        const { fields } = await docAccessOperation({
          id,
          collection: payload.collections.managers,
          req: managerReq(atlasManager),
        })
        // `sanitizePermissions` collapses a set whose every operation is true to
        // a bare `true`. It cannot here — `type` and `roles` carry
        // `update: adminOnlyFieldAccess` — so narrowing it is not a fallback.
        if (fields === true) throw new Error('every field allowed: the update locks are gone')
        return names.filter((name) => {
          const field = fields[name]
          return field === true || field?.read === true
        })
      }

      const asked = ['name', 'email', 'contactDetails', 'notificationPreferences']
      expect(await readableOn(atlasManager.id, asked)).toEqual(asked)
      expect(await readableOn(eventManager.id, asked)).toEqual(['name'])
    })

    it('is the only thing narrowing the read — an admin still sees every field', async () => {
      // Non-vacuity for the three cases above: the fixture really does hold a
      // value in every field they assert is gone, and the locks are what
      // withhold them rather than an empty row.
      const whole = await payload.findByID({
        collection: 'managers',
        id: eventManager.id,
        depth: 0,
        overrideAccess: false,
        req: managerReq(adminUser),
      })

      expect(whole.email).toBe('event-manager@example.com')
      expect(whole.type).toBe('manager')
      expect(whole.contactDetails).toHaveLength(1)
      expect(whole.notificationPreferences).toMatchObject({
        event_verification: { frequency: 'Monthly' },
      })
      expect(whole.legacyId).toBe(4242)
      expect(whole.legacyData).toMatchObject({ phone: '+15550000001' })
      expect(whole.magicLinkIssuedAt).toBeTruthy()
      // The invitation queue owns this column's shape, so only its presence is
      // this spec's business.
      expect(whole.pendingInvitation).toBeTruthy()
      expect(whole.invitationDueAt).toBeTruthy()
      expect(whole.lastRegistrationDigestSentAt).toBeTruthy()
    })

    it('still reads and writes registrationNotificationEmail', async () => {
      const read = await payload.findByID({
        collection: 'events',
        id: event.id,
        depth: 0,
        overrideAccess: false,
        req: managerReq(eventManager),
      })
      expect(read.registrationNotificationEmail).toBe(NOTIFICATION_EMAIL)

      const updated = await payload.update({
        collection: 'events',
        id: event.id,
        data: { registrationNotificationEmail: 'rewritten@example.com' },
        overrideAccess: false,
        req: managerReq(eventManager),
      })
      expect(updated.registrationNotificationEmail).toBe('rewritten@example.com')

      await payload.update({
        collection: 'events',
        id: event.id,
        data: { registrationNotificationEmail: NOTIFICATION_EMAIL },
        overrideAccess: true,
      })
    })
  })
  // Ardnived, 2026-10-30: "Region managers should be able to see the email
  // addresses of managers on sub-regions and events within their region. They
  // need to be able to contact these users." Two fields widen, on the rows the
  // same subtree test atlas-manager writes pass places inside the reader's
  // owned regions, and nothing else does (`src/collections/Managers/access.ts`).
  describe('a region manager (#908, widened to the region)', () => {
    let regionManager: Manager
    let coManager: Manager
    let subRegionManager: Manager
    let subtreeEventManager: Manager
    let parentRegion: Region
    let subRegion: Region
    let subtreeEvent: Event

    /** A manager carrying a value in every field the widening must keep hidden. */
    const contactable = (name: string, slug: string) =>
      testData.createManager(payload, {
        name,
        email: `${slug}@example.com`,
        roles: ['atlas-manager'],
        language: 'en',
        contactDetails: [{ platform: 'telegram', identifier: `@${slug}` }],
        notificationPreferences: { event_verification: { frequency: 'Monthly', method: 'email' } },
        lastRegistrationDigestSentAt: new Date().toISOString(),
        legacyId: 9000 + slug.length,
        legacyData: { phone: `+1555${slug.length}` },
        magicLinkIssuedAt: new Date().toISOString(),
      })

    /** Every key a widened row carries: the title, the two contact fields, and what Payload adds. */
    const WIDENED_KEYS = [
      'collection',
      'contactDetails',
      'createdAt',
      'email',
      'id',
      'name',
      'sessions',
      'updatedAt',
    ]

    const listAs = async (reader: Manager, target: Manager): Promise<Manager> => {
      const { docs } = await payload.find({
        collection: 'managers',
        depth: 0,
        pagination: false,
        overrideAccess: false,
        req: managerReq(reader),
      })
      const row = docs.find((doc) => doc.id === target.id)
      expect(row, `${reader.name} should list ${target.name}`).toBeDefined()
      return row!
    }

    beforeAll(async () => {
      regionManager = await contactable('Region Manager', 'region-manager')
      coManager = await contactable('Co Manager', 'co-manager')
      subRegionManager = await contactable('Sub-region Manager', 'sub-region-manager')
      subtreeEventManager = await contactable('Subtree Event Manager', 'subtree-event-manager')

      parentRegion = await testData.createRegion(payload, {
        name: 'Widened Country',
        level: 'country',
        managers: [regionManager.id, coManager.id],
      })
      subRegion = await testData.createRegion(payload, {
        name: 'Widened City',
        parent: parentRegion.id,
        managers: [subRegionManager.id],
      })
      subtreeEvent = await testData.createEvent(payload, {
        title: 'Subtree Event',
        manager: subtreeEventManager.id,
        region: subRegion.id,
        _status: 'published',
      })
    })

    it('reads the email and contact methods of an event manager inside its subtree', async () => {
      const row = await listAs(regionManager, subtreeEventManager)

      expect(row.email).toBe('subtree-event-manager@example.com')
      expect(row.contactDetails).toMatchObject([
        { platform: 'telegram', identifier: '@subtree-event-manager' },
      ])
      // Every other locked field stays locked: the fixture holds a value in
      // each, so a missing key is the lock and not an empty column.
      expect(Object.keys(row).sort()).toEqual(WIDENED_KEYS)
    })

    it('reads the email and contact methods of a sub-region manager', async () => {
      const row = await listAs(regionManager, subRegionManager)

      expect(row.email).toBe('sub-region-manager@example.com')
      expect(row.contactDetails).toHaveLength(1)
      expect(Object.keys(row).sort()).toEqual(WIDENED_KEYS)
    })

    it('reads a co-manager of its own region the same way', async () => {
      // The owned subtree includes its roots, so a region's co-managers reach
      // each other — they already hold the same write scope over it.
      const row = await listAs(regionManager, coManager)

      expect(row.email).toBe('co-manager@example.com')
      expect(Object.keys(row).sort()).toEqual(WIDENED_KEYS)
    })

    it('reads only the title of a manager assigned outside its region', async () => {
      // `eventManager` manages "Managed City", which is not under this region.
      const row = await listAs(regionManager, eventManager)

      expect(row.email).toBeUndefined()
      expect(row.contactDetails).toEqual([])
    })

    it('widens nothing upward: a sub-region manager reads only the parent’s title', async () => {
      const row = await listAs(subRegionManager, regionManager)

      expect(row.email).toBeUndefined()
      expect(row.contactDetails).toEqual([])
    })

    it('widens nothing for an atlas-manager outside the region', async () => {
      for (const target of [subtreeEventManager, subRegionManager, regionManager]) {
        const row = await listAs(atlasManager, target)
        expect(Object.keys(row).sort(), target.name).toEqual([
          'collection',
          'contactDetails',
          'createdAt',
          'id',
          'name',
          'sessions',
          'updatedAt',
        ])
        expect(row.contactDetails).toEqual([])
      }
    })

    it('reads no other locked field, asking for each by name', async () => {
      const row = await payload.findByID({
        collection: 'managers',
        id: subtreeEventManager.id,
        select: {
          name: true,
          email: true,
          contactDetails: true,
          type: true,
          roles: true,
          language: true,
          notificationPreferences: true,
          lastRegistrationDigestSentAt: true,
          legacyId: true,
          legacyData: true,
          magicLinkIssuedAt: true,
          pendingInvitation: true,
          invitationDueAt: true,
          _verified: true,
          managedEvents: true,
          managedRegions: true,
        },
        depth: 0,
        overrideAccess: false,
        req: managerReq(regionManager),
      })

      expect(Object.keys(row).sort()).toEqual([
        'collection',
        'contactDetails',
        'email',
        'id',
        'name',
      ])
    })

    it('reads the assigned manager’s email through Events.manager and Regions.managers', async () => {
      const [inside, insideRegion, outside] = await Promise.all([
        payload.findByID({
          collection: 'events',
          id: subtreeEvent.id,
          select: { manager: true },
          depth: 1,
          overrideAccess: false,
          req: managerReq(regionManager),
        }),
        payload.findByID({
          collection: 'regions',
          id: subRegion.id,
          select: { managers: true },
          depth: 1,
          overrideAccess: false,
          req: managerReq(regionManager),
        }),
        payload.findByID({
          collection: 'events',
          id: event.id,
          select: { manager: true },
          depth: 1,
          overrideAccess: false,
          req: managerReq(regionManager),
        }),
      ])

      const populated = inside.manager as Manager
      expect(populated.email).toBe('subtree-event-manager@example.com')
      expect(populated.notificationPreferences).toBeUndefined()
      expect((insideRegion.managers as Manager[])[0]!.email).toBe('sub-region-manager@example.com')
      // The same read one region over populates the title alone.
      expect((outside.manager as Manager).name).toBe('Event Manager')
      expect((outside.manager as Manager).email).toBeUndefined()
    })

    it('is offered the two contact inputs in the admin drawer, and no others', async () => {
      const { fields } = await docAccessOperation({
        id: subtreeEventManager.id,
        collection: payload.collections.managers,
        req: managerReq(regionManager),
      })
      if (fields === true) throw new Error('every field allowed: the update locks are gone')

      const asked = ['name', 'email', 'contactDetails', 'notificationPreferences', 'legacyData']
      const readable = asked.filter((name) => {
        const field = fields[name]
        return field === true || field?.read === true
      })
      expect(readable).toEqual(['name', 'email', 'contactDetails'])
    })

    it('still cannot filter, sort or list distinct values on either contact field', async () => {
      // ⚠ With no row in hand the lock answers for every row: which rows match
      // `email like …` would read an address out a prefix at a time, for
      // managers anywhere — the widening reaches only a row actually read.
      const req = () => managerReq(regionManager)
      const probes: Where[] = [
        { email: { like: 'sub-region' } },
        { 'contactDetails.identifier': { like: '@sub' } },
        { or: [{ email: { equals: 'event-manager@example.com' } }] },
      ]
      for (const where of probes) {
        await expect(
          payload.find({ collection: 'managers', where, overrideAccess: false, req: req() }),
          JSON.stringify(where),
        ).rejects.toThrow('The following path cannot be queried')
      }
      // Across the relationship from another collection, too.
      await expect(
        payload.find({
          collection: 'events',
          where: { 'manager.email': { like: 'subtree' } },
          overrideAccess: false,
          req: req(),
        }),
      ).rejects.toThrow('The following path cannot be queried')
      await expect(
        payload.find({ collection: 'managers', sort: 'email', overrideAccess: false, req: req() }),
      ).rejects.toThrow('The following path cannot be queried')
      await expect(
        payload.findDistinct({
          collection: 'managers',
          field: 'email',
          overrideAccess: false,
          req: req(),
        }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('decides a whole list on one events query, however many rows it holds', async () => {
      // The decision is a per-request set, not a query per row: N managers
      // must not cost N lookups.
      const spy = vi.spyOn(payload, 'find')
      try {
        const req = managerReq(regionManager)
        const { docs } = await payload.find({
          collection: 'managers',
          depth: 0,
          pagination: false,
          overrideAccess: false,
          req,
        })
        expect(docs.length).toBeGreaterThanOrEqual(6)
        const eventsQueries = spy.mock.calls.filter(([args]) => args.collection === 'events')
        expect(eventsQueries).toHaveLength(1)
      } finally {
        spy.mockRestore()
      }
    })
  })
})
