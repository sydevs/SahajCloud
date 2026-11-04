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
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildReminderEntry } from '@/lib/eventVerification/log'
import type { Client, Event, Manager, Region } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

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
  type AuthManager = Awaited<ReturnType<typeof testData.authUser>>
  let eventManager: AuthManager
  let atlasManager: AuthManager
  /** Named on one event and listed on no region — `atlas-event-manager` alone. */
  let eventOnlyManager: AuthManager
  /** The event that assignee is named on, and one in the same region they are not. */
  let assignedEvent: Event
  let unassignedEvent: Event
  let client: Client
  let event: Event
  let region: Region

  /** A client request, as API-key auth builds one. The key is unused: no read below goes over REST. */
  const clientReq = (): PayloadRequest => {
    const base = createClientAuthenticatedRequest(client.id, 'unused', ['sahaj-atlas-client'])
    return { ...base, payload, context: {} } as unknown as PayloadRequest
  }

  const managerReq = (manager: AuthManager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      context: {},
      locale: 'en',
      user: manager,
    }) as unknown as PayloadRequest

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const listedOnRegion = await testData.createManager(payload, {
      name: 'Event Manager',
      email: 'event-manager@example.com',
      roles: [],
    })
    const listedElsewhere = await testData.createManager(payload, {
      name: 'Atlas Manager',
      email: 'atlas-manager@example.com',
      roles: [],
    })
    const assignedOnly = await testData.createManager(payload, {
      name: 'Event-only Manager',
      email: 'event-only-manager@example.com',
      roles: [],
    })

    region = await testData.createRegion(payload, {
      name: 'Managed City',
      managers: [listedOnRegion.id],
    })
    await testData.createRegion(payload, {
      name: 'Another Managed City',
      managers: [listedElsewhere.id],
    })
    // Both Atlas roles are derived from these joins, so each user has to be
    // re-read once the listing exists — see `testData.authUser`.
    eventManager = await testData.authUser(payload, listedOnRegion)
    atlasManager = await testData.authUser(payload, listedElsewhere)
    event = await testData.createEvent(payload, {
      title: 'Managed Event',
      manager: eventManager.id,
      region: region.id,
      registrationMode: 'sahaj-atlas',
      registrationNotificationEmail: NOTIFICATION_EMAIL,
      contactEmail: PUBLIC_EMAIL,
      _status: 'published',
    })
    const unowned = await testData.createRegion(payload, { name: 'Unowned City' })
    assignedEvent = await testData.createEvent(payload, {
      title: 'Assigned Event',
      manager: assignedOnly.id,
      region: unowned.id,
      _status: 'published',
    })
    unassignedEvent = await testData.createEvent(payload, {
      title: 'Nobody’s Event',
      region: unowned.id,
      _status: 'published',
    })
    eventOnlyManager = await testData.authUser(payload, assignedOnly)

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

  describe('an Atlas region manager', () => {
    it('still reads managers, through the explicit grant', async () => {
      const { docs } = await payload.find({
        collection: 'managers',
        depth: 0,
        pagination: false,
        overrideAccess: false,
        req: managerReq(atlasManager),
      })

      // The picker lists OTHER managers, so a self-scoped result would be a
      // regression rather than a pass.
      expect(docs.some((doc) => doc.id === eventManager.id)).toBe(true)
    })
  })

  describe('an event-only Atlas manager', () => {
    it('reads the registrants but not the roster', async () => {
      // `atlas-event-manager` runs one listing. It picks on nothing, so it
      // holds none of the `managers` grant the region role needs for its
      // pickers — and `managers` is restricted, so no implicit read reaches it.
      await expect(
        payload.find({
          collection: 'managers',
          depth: 0,
          overrideAccess: false,
          req: managerReq(eventOnlyManager),
        }),
      ).rejects.toThrow(/not allowed to perform this action/i)

      // `users` it does read: a submission's `senderEmail` resolves through
      // it, under the reader's own access (#1060).
      await expect(
        payload.find({
          collection: 'users',
          depth: 0,
          overrideAccess: false,
          req: managerReq(eventOnlyManager),
        }),
      ).resolves.toBeDefined()
    })

    it('holds the event it is named on, and no other in the same region', async () => {
      const own = await payload.update({
        collection: 'events',
        id: assignedEvent.id,
        data: { contactPhone: '+44 20 1234 5678' },
        overrideAccess: false,
        req: managerReq(eventOnlyManager),
      })
      expect(own.contactPhone).toBe('+44 20 1234 5678')

      await expect(
        payload.update({
          collection: 'events',
          id: unassignedEvent.id,
          data: { contactPhone: '+44 20 8765 4321' },
          overrideAccess: false,
          req: managerReq(eventOnlyManager),
        }),
      ).rejects.toThrow()
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
})
