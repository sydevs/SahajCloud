/**
 * No API client reads a manager's name or email address (#821).
 *
 * `managers` sat in no project, which implicit read treats as *shared* rather
 * than restrictive, so every published key — the Atlas widget's browser key
 * included — read every manager's name and address. Six paths reached it: the
 * collection directly, four `relationTo: 'managers'` fields at `depth >= 1`,
 * and one denormalized copy of an address that is not a relationship at all.
 *
 * ## Why every read here goes through `overrideAccess: false`
 *
 * Adding a slug to `RESTRICTED_COLLECTIONS` proves nothing on its own — a
 * collection's own `access` block outranks the generated one, and
 * `accessPlugin` spreads it last. `hasPermission` is the pure predicate and
 * would have answered "denied" while the composed config still served rows.
 * Only a `find` the access layer actually applies can tell the two apart. The
 * one `hasPermission` case below is deliberately about role *configuration* —
 * that no client role carries a grant — which is the one question a predicate
 * is the right tool for.
 *
 * ⚠ **A client read is refused for two different reasons, and only one is this
 * ticket's.** The usage plugin rejects any client read carrying no `select`
 * with a 400 before access runs, so a bare `rejects.toThrow()` would go green
 * against a wide-open collection. Every read below declares `select`, and the
 * refusals assert a 403 specifically.
 *
 * ⚠ **Each fixture is read back as an admin first.** A populate that resolves
 * to a bare id and a relationship that was never seeded look identical from the
 * client side.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Client, Event, Manager, Region } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** The address seeded on the event, and the one no client may read back. */
const NOTIFICATION_EMAIL = 'registrations-go-here@example.com'

describe('Managers access (#821)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let eventManager: Manager
  let atlasManager: Manager
  let client: Client
  let event: Event
  let region: Region

  /**
   * A client request, exactly as API-key auth builds one: `req.user` is the
   * client document, and `roles` is a flat array (they are not localized).
   */
  const clientReq = (roles: string[] = ['sahaj-atlas-client']): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      context: {},
      user: { ...client, collection: 'clients', roles },
    }) as unknown as PayloadRequest

  const managerReq = (manager: Manager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      context: {},
      locale: 'en',
      user: { ...manager, collection: 'managers' },
    }) as unknown as PayloadRequest

  /** The HTTP status a refused read carried, or `null` when it was not refused. */
  const statusOf = async (read: Promise<unknown>): Promise<number | null> => {
    try {
      await read
      return null
    } catch (error) {
      return (error as { status?: number }).status ?? 0
    }
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    eventManager = await testData.createManager(payload, {
      name: 'Event Manager',
      email: 'event-manager@example.com',
      roles: ['atlas-manager'],
    })
    atlasManager = await testData.createManager(payload, {
      name: 'Atlas Manager',
      email: 'atlas-manager@example.com',
      roles: ['atlas-manager'],
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
      _status: 'published',
    } as never)
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
    })
  })

  describe('a published client key', () => {
    it('reads no manager row at all', async () => {
      // 403, not 400: a bare rejection would also be satisfied by the usage
      // plugin's select gate, which fires before access is consulted.
      const status = await statusOf(
        payload.find({
          collection: 'managers',
          select: { name: true, email: true },
          depth: 0,
          overrideAccess: false,
          req: clientReq(),
        }),
      )
      expect(status).toBe(403)
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

    it('gets bare ids, not managers, from a client at depth 1', async () => {
      // `clients` is not restricted — #822 owns that half — so this key still
      // reads the row. What it must not read is who runs it.
      const { docs } = await payload.find({
        collection: 'clients',
        select: { name: true, managers: true, primaryContact: true },
        depth: 1,
        overrideAccess: false,
        req: clientReq(),
      })

      const self = docs.find((doc) => doc.id === client.id)
      expect(self).toBeDefined()
      expect(self!.managers).toEqual([eventManager.id])
      expect(self!.primaryContact).toBe(eventManager.id)
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
      const { docs } = await payload.find({
        collection: 'events',
        select: { title: true, contactName: true },
        depth: 0,
        overrideAccess: false,
        req: clientReq(),
      })
      expect(docs.find((doc) => doc.id === event.id)?.contactName).toBe('Test Contact')
    })
  })

  describe('client roles', () => {
    it('carry no managers grant, in any role', () => {
      const roles = ['sahaj-atlas-client', 'wemeditate-web-client', 'wemeditate-app-client']
      for (const role of roles) {
        const user = { id: client.id, collection: 'clients', _status: 'published', roles: [role] }
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

  describe('an atlas-manager', () => {
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
