/**
 * Who reaches a manager's contact details beyond their own row (#908).
 *
 * Every field on another manager but `name` is locked to that manager and to
 * admins (`managers-access.int.spec.ts`). These are the two surfaces that hand
 * the details back to the people who have to follow up, both behind
 * `mayReadManagerContacts`: the contacts table under `Regions.managers` and
 * `Events.manager`, and an event's activity log, whose reminder entries record
 * where each one went. A third, the drawer behind a class manager's "Add new
 * event", is deliberately wider than that gate (#1140).
 *
 * The tree: a country above a region above a city, with the event in the city.
 * Each level has its own manager, the region two, and an unrelated region holds
 * the outsider. The city lists a deactivated manager beside its own, who may
 * add nothing and so is nobody to ask.
 */
import type { Payload, PayloadRequest } from 'payload'

import { createLocalReq, docAccessOperation } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadRegionContacts } from '@/components/admin/Dashboard/AtlasManager/regionContacts'
import { loadManagerContacts, STALE_SIGN_IN_MONTHS } from '@/components/admin/ManagerContacts/data'
import { buildReminderEntry } from '@/lib/eventVerification/log'
import type { Event } from '@/payload-types'
import { createSession } from '@/plugins/login'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const DAY_MS = 24 * 60 * 60 * 1000
const REMINDER_DESTINATION = 'event-assignee@example.com'

describe('Manager contacts (#908)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  type AuthManager = Awaited<ReturnType<typeof testData.authUser>>
  let admin: AuthManager
  let countryManager: AuthManager
  let regionManager: AuthManager
  let coManager: AuthManager
  let cityManager: AuthManager
  let eventManager: AuthManager
  let outsider: AuthManager
  let regionId: number
  let cityId: number
  let event: Event

  const request = (user: AuthManager): Promise<PayloadRequest> =>
    createLocalReq({ user: { ...user, collection: 'managers' }, locale: 'en' }, payload)

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = (name: string) =>
      testData.createManager(payload, {
        name,
        email: `${name.toLowerCase().replace(/\W+/g, '-')}@example.com`,
        roles: [],
        currentProject: 'sahaj-atlas',
      })
    const [adminRow, country, region, co, city, dormant, assignee, outside] = await Promise.all([
      testData.createManager(payload, { type: 'admin' }),
      manager('Country Manager'),
      manager('Region Manager'),
      manager('Co Manager'),
      manager('City Manager'),
      testData.createManager(payload, {
        name: 'Dormant Manager',
        email: 'dormant-manager@example.com',
        roles: [],
        currentProject: 'sahaj-atlas',
        type: 'inactive',
      }),
      testData.createManager(payload, {
        name: 'Event Assignee',
        email: REMINDER_DESTINATION,
        roles: [],
        currentProject: 'sahaj-atlas',
      }),
      manager('Outside Manager'),
    ])

    const countryRow = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Contacts Country',
        level: 'country',
        mapboxId: 'country.contacts',
        managers: [country.id],
      }),
    })
    const regionRow = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Contacts Region',
        level: 'region',
        parent: countryRow.id,
        mapboxId: 'region.contacts',
        managers: [region.id, co.id],
      }),
    })
    regionId = regionRow.id
    const cityRow = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Contacts City',
        level: 'city',
        parent: regionRow.id,
        mapboxId: 'city.contacts',
        managers: [city.id, dormant.id],
      }),
    })
    cityId = cityRow.id
    await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Elsewhere',
        level: 'country',
        mapboxId: 'country.elsewhere',
        managers: [outside.id],
      }),
    })

    event = await testData.createEvent(payload, {
      title: 'Contacts Event',
      region: cityRow.id,
      manager: assignee.id,
    })
    // Written after the create, under `skipVerifyHook`: `syncVerificationOnSave`
    // resets the log on any managed save, so a log passed to the create would
    // be discarded and every case below would pass vacuously.
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
            manager: { id: assignee.id, name: assignee.name },
            channel: 'email',
            destination: REMINDER_DESTINATION,
            at: new Date().toISOString(),
          }),
        ],
      } as never,
    })

    // Both Atlas roles are derived from the listings above, so each user is
    // re-read once theirs exists — see `testData.authUser`.
    ;[admin, countryManager, regionManager, coManager, cityManager, eventManager, outsider] =
      await Promise.all(
        [adminRow, country, region, co, city, assignee, outside].map((row) =>
          testData.authUser(payload, row),
        ),
      )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the contacts table', () => {
    const tableFor = async (
      user: AuthManager,
      collection: 'events' | 'regions',
      id: number | string,
      now?: Date,
    ) => loadManagerContacts(await request(user), collection, id, now)
    const namesIn = (rows: Awaited<ReturnType<typeof tableFor>>) => rows?.map((row) => row.name)

    it('shows a region’s managers to admins, co-managers and the managers above', async () => {
      for (const user of [admin, regionManager, coManager, countryManager]) {
        expect(namesIn(await tableFor(user, 'regions', regionId))).toEqual([
          'Region Manager',
          'Co Manager',
        ])
      }
    })

    it('shows a region’s managers to nobody below it or outside it', async () => {
      // Downward only: a city manager reads the region above them by name, in
      // the picker, and no further.
      for (const user of [cityManager, eventManager, outsider]) {
        expect(await tableFor(user, 'regions', regionId)).toBeNull()
      }
    })

    it('shows an event’s manager to them and to every manager of a region above it', async () => {
      for (const user of [admin, eventManager, cityManager, regionManager, countryManager]) {
        expect(namesIn(await tableFor(user, 'events', event.id))).toEqual(['Event Assignee'])
      }
      expect(await tableFor(outsider, 'events', event.id)).toBeNull()
    })

    it('carries the name, a mailto-ready email and the last sign-in, nothing else', async () => {
      const rows = await tableFor(countryManager, 'events', event.id)
      expect(rows).toHaveLength(1)
      expect(Object.keys(rows![0]!).sort()).toEqual(['email', 'id', 'lastSignIn', 'name'])
      expect(rows![0]!.email).toBe(REMINDER_DESTINATION)
    })

    it('says on one line when each manager last signed in, and "never" for one who has not', async () => {
      const now = new Date()
      const signedIn = new Date(now.getTime() - 21 * DAY_MS).toISOString()
      await payload.update({
        collection: 'managers',
        id: coManager.id,
        overrideAccess: true,
        data: { lastLoginAt: signedIn },
      })

      const rows = await tableFor(regionManager, 'regions', regionId, now)
      const byName = Object.fromEntries(rows!.map((row) => [row.name, row.lastSignIn]))
      // Spelled out rather than taken from `formatShortDate`, so the day the
      // table shows is pinned against the formatter rather than by it.
      const day = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(signedIn))
      expect(byName['Co Manager']).toEqual({
        text: `${day} - 3 weeks ago`,
        stale: false,
      })
      expect(byName['Region Manager']).toBeNull()
    })

    it(`marks a sign-in stale once it is over ${STALE_SIGN_IN_MONTHS} months old`, async () => {
      const now = new Date()
      const staleAfter = async (months: number, days: number) => {
        const signedIn = new Date(now)
        signedIn.setUTCMonth(signedIn.getUTCMonth() - months)
        signedIn.setUTCDate(signedIn.getUTCDate() - days)
        await payload.update({
          collection: 'managers',
          id: coManager.id,
          overrideAccess: true,
          data: { lastLoginAt: signedIn.toISOString() },
        })
        const rows = await tableFor(regionManager, 'regions', regionId, now)
        return rows!.find((row) => row.name === 'Co Manager')!.lastSignIn!.stale
      }

      expect(await staleAfter(STALE_SIGN_IN_MONTHS, -1)).toBe(false)
      expect(await staleAfter(STALE_SIGN_IN_MONTHS, 1)).toBe(true)
    })

    it('sits under both descriptions, with the empty afterInput that re-renders it after a save', () => {
      // ⚠ `Description` puts the table under the description, which
      // `afterInput` would render it above. Without an `afterInput`,
      // `renderField` renders a `Description` once and keeps it through a save,
      // so the table would go on listing the managers the page loaded with.
      for (const [collection, name] of [
        ['regions', 'managers'],
        ['events', 'manager'],
      ] as const) {
        const field = payload.collections[collection].config.flattenedFields.find(
          (candidate) => candidate.name === name,
        ) as { admin?: { components?: Record<string, unknown> } } | undefined
        expect(field?.admin?.components, `${collection}.${name}`).toMatchObject({
          Description: '@/components/admin/ManagerContacts',
          afterInput: [],
        })
      }
    })

    it('answers the create screen, and an unknown row, with nothing', async () => {
      expect(await tableFor(admin, 'regions', 'create')).toBeNull()
      expect(await tableFor(admin, 'events', 987654)).toBeNull()
    })
  })

  describe('who a class manager asks to add an event (#1140)', () => {
    const contactsFor = async (user: AuthManager) =>
      loadRegionContacts(await request(user), user.id)

    it('names every manager above their events, nearest region first', async () => {
      const contacts = await contactsFor(eventManager)
      expect(contacts.map((contact) => [contact.name, contact.region])).toEqual([
        ['City Manager', 'Contacts City'],
        ['Region Manager', 'Contacts Region'],
        ['Co Manager', 'Contacts Region'],
        ['Country Manager', 'Contacts Country'],
      ])
    })

    it('never names a deactivated manager, who may add nothing', async () => {
      // Listed on the nearest region of all, so only the `type` filter keeps
      // them out of the drawer.
      const contacts = await contactsFor(eventManager)
      expect(contacts.map((contact) => contact.name)).not.toContain('Dormant Manager')
    })

    it('carries the name, the region and a mailto-ready email, nothing else', async () => {
      const [first] = await contactsFor(eventManager)
      expect(Object.keys(first!).sort()).toEqual(['email', 'id', 'name', 'region'])
      expect(first!.email).toBe('city-manager@example.com')
    })

    it('names nobody to a manager who runs no event', async () => {
      expect(await contactsFor(outsider)).toEqual([])
    })

    it('never asks a manager to email themselves', async () => {
      // The city's own manager, running a class in it: everyone above them is
      // someone to ask, and they are not.
      await testData.createEvent(payload, {
        title: 'City Manager’s own class',
        region: cityId,
        manager: cityManager.id,
      })
      const contacts = await contactsFor(cityManager)
      expect(contacts.map((contact) => contact.name)).toEqual([
        'Region Manager',
        'Co Manager',
        'Country Manager',
      ])
    })

    it('reaches past the gate that governs the contacts table', async () => {
      // The decision this ticket carries (Anton, 12 Nov 2026): the drawer shows
      // a class manager what `mayReadManagerContacts` refuses them.
      const table = await loadManagerContacts(await request(eventManager), 'regions', regionId)
      expect(table).toBeNull()
      expect((await contactsFor(eventManager)).map((contact) => contact.name)).toContain(
        'Region Manager',
      )
    })
  })

  describe('an event’s activity log', () => {
    const readAs = async (user: AuthManager) =>
      payload.findByID({
        collection: 'events',
        id: event.id,
        depth: 0,
        overrideAccess: false,
        req: await request(user),
      })

    it('is read by admins, the event’s manager and every manager above it', async () => {
      for (const user of [admin, eventManager, cityManager, regionManager, countryManager]) {
        const read = await readAs(user)
        expect(JSON.stringify(read.activityLog)).toContain(REMINDER_DESTINATION)
      }
    })

    it('discloses no entry to a manager outside the region, who still reads the event', async () => {
      const read = await readAs(outsider)
      expect(read.title).toBe('Contacts Event')
      // One row per entry, so a denied read answers with no rows rather than
      // by leaving the field out. Nothing a reminder recorded is in the answer.
      expect(read.activityLog ?? []).toEqual([])
    })

    it('is offered in the admin form to the same managers, and not to the outsider', async () => {
      const readable = async (user: AuthManager) => {
        const { fields } = await docAccessOperation({
          id: event.id,
          collection: payload.collections.events,
          req: await request(user),
        })
        if (fields === true) return true
        const field = fields.activityLog
        return field === true || field?.read === true
      }
      expect(await readable(cityManager)).toBe(true)
      expect(await readable(outsider)).toBe(false)
    })

    it('reaches version history for a manager who holds it', async () => {
      // A versions read hands the lock the version's own row, so it judges the
      // same region and manager the document holds.
      const { docs } = await payload.findVersions({
        collection: 'events',
        where: { parent: { equals: event.id } },
        sort: '-updatedAt',
        limit: 1,
        overrideAccess: false,
        req: await request(cityManager),
      })
      expect(JSON.stringify(docs[0]?.version.activityLog)).toContain(REMINDER_DESTINATION)
    })

    it('cannot be filtered on by anyone but an admin, since a query has no row to judge', async () => {
      const where = { 'activityLog.type': { equals: 'reminder' } }
      await expect(
        payload.find({
          collection: 'events',
          where,
          overrideAccess: false,
          req: await request(cityManager),
        }),
      ).rejects.toThrow(/cannot be queried/i)
      await expect(
        payload.find({
          collection: 'events',
          where,
          overrideAccess: false,
          req: await request(admin),
        }),
      ).resolves.toBeDefined()
    })

    it('offers no path at all to the address a reminder went to', async () => {
      // A reminder's machine fields are one json column on the entry, so no
      // query can name one — an admin's included.
      await expect(
        payload.find({
          collection: 'events',
          where: { 'activityLog.destination': { equals: REMINDER_DESTINATION } },
          overrideAccess: false,
          req: await request(admin),
        }),
      ).rejects.toThrow(/cannot be queried/i)
    })
  })

  describe('lastLoginAt', () => {
    it('is stamped by minting a session, which every sign-in does', async () => {
      const before = Date.now()
      await createSession(payload, 'managers', outsider.id)

      const row = await payload.findByID({
        collection: 'managers',
        id: outsider.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(row.lastLoginAt).toBeTruthy()
      expect(new Date(row.lastLoginAt!).getTime()).toBeGreaterThanOrEqual(before - 1000)
      expect(row.lastLoginAt).toBe(row.sessions?.at(-1)?.createdAt)
    })

    it('is not the account holder’s to write', async () => {
      const { lastLoginAt } = await payload.findByID({
        collection: 'managers',
        id: outsider.id,
        depth: 0,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'managers',
        id: outsider.id,
        data: { lastLoginAt: '2099-01-01T00:00:00.000Z' },
        overrideAccess: false,
        req: await request(outsider),
      })

      const after = await payload.findByID({
        collection: 'managers',
        id: outsider.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(after.lastLoginAt).toBe(lastLoginAt)
    })
  })
})
