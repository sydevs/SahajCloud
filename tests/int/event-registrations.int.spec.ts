import type { Payload } from 'payload'

import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  acceptedRegistrationsCsv,
  countAcceptedRegistrations,
  loadEventRegistrations,
} from '@/components/admin/EventRegistrations/data'
import type { RegistrationQuery } from '@/components/admin/EventRegistrations/data'

import { createRestClientAs } from '../utils/restRequest'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** The event's own Registrations view (#1069). The three homes live in `atlas-overview.int.spec.ts`. */
describe('Event registrations', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let env: Awaited<ReturnType<typeof createTestEnvironment>>
  type AuthManager = Awaited<ReturnType<typeof testData.authUser>>
  let owner: AuthManager
  let assignee: AuthManager
  let ownId: number
  let cityId: number
  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    const listed = await testData.createManager(payload, {
      type: 'manager',
      roles: [],
      currentProject: 'sahaj-atlas',
    })
    const assigned = await testData.createManager(payload, {
      type: 'manager',
      roles: [],
      currentProject: 'sahaj-atlas',
    })
    const country = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Dashboard Country',
        level: 'country',
        mapboxId: 'country.dashboard',
      }),
    })
    const city = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Dashboard City',
        level: 'city',
        parent: country.id,
        managers: [listed.id],
        mapboxId: 'city.dashboard',
      }),
    })
    cityId = city.id
    // Both Atlas roles are derived from the listings above and below, so each
    // user is re-read once theirs exists — see `testData.authUser`.
    owner = await testData.authUser(payload, listed)
    const otherCity = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Other City',
        level: 'city',
        parent: country.id,
        mapboxId: 'city.other-dashboard',
      }),
    })
    const event = await payload.create({
      collection: 'events',
      draft: true,
      context: { skipVerifyHook: true },
      data: {
        title: 'Owned draft',
        region: city.id,
        eventType: 'offline',
        verificationStage: 'urgent',
      },
    })
    ownId = event.id
    // Naming `assignee` on an event is what gives them the program role.
    await payload.create({
      collection: 'events',
      draft: true,
      data: {
        title: 'Assigned draft',
        region: otherCity.id,
        manager: assigned.id,
        eventType: 'offline',
      },
    })
    assignee = await testData.authUser(payload, assigned)
  })
  afterAll(async () => cleanup())
  const request = (user: AuthManager) =>
    createLocalReq({ user: { ...user, collection: 'managers' }, locale: 'en' }, payload)

  describe('Event registrations tab', () => {
    let tabEventId: number
    let admin: AuthManager
    let stranger: AuthManager

    const register = (
      eventId: number,
      name: string,
      overrides: Record<string, unknown> = {},
      answers: Record<string, string> = {},
    ) =>
      payload.create({
        collection: 'user-submissions',
        overrideAccess: true,
        data: createData<'user-submissions'>({
          type: 'registration',
          event: eventId,
          senderEmail: `${name.toLowerCase().replace(/\W+/g, '-')}@example.com`,
          submissionData: [
            { field: 'name', value: name },
            ...Object.entries(answers).map(([field, value]) => ({ field, value })),
          ],
          ...overrides,
        }),
      })

    const openTab = async (user: AuthManager, query: Partial<RegistrationQuery> = {}) =>
      loadEventRegistrations(await request(user), tabEventId, {
        filter: 'accepted',
        page: 1,
        ...query,
      })

    beforeAll(async () => {
      admin = await testData.authUser(
        payload,
        await testData.createManager(payload, { type: 'admin' }),
      )
      // An Atlas region manager of a subtree of their own: the listing is
      // where that role comes from now, so these refusals are about this
      // event rather than about holding no Atlas role at all.
      const unrelated = await testData.createManager(payload, {
        type: 'manager',
        roles: [],
        currentProject: 'sahaj-atlas',
      })
      await payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          name: 'Stranger Country',
          level: 'country',
          managers: [unrelated.id],
          mapboxId: 'country.stranger',
        }),
      })
      stranger = await testData.authUser(payload, unrelated)
      // In `owner`'s region subtree, so `owner` holds `update` on it — the
      // authority this tab is deliberately narrower than.
      const tabEvent = await testData.createEvent(payload, {
        title: 'Tab program',
        manager: assignee.id,
        region: cityId,
      })
      tabEventId = tabEvent.id
      await register(
        tabEventId,
        'Ada Lovelace',
        { status: 'accepted', startingAt: '2099-08-05T18:00:00.000Z' },
        {
          referral: 'A friend',
          // Typed by the visitor, so the CSV must not hand it to a spreadsheet
          // as a formula.
          questions: '=SUM(1,1)',
          locale: 'fr',
          userAgent: 'Mozilla/5.0',
        },
      )
      await register(tabEventId, 'Pat Pending')
      await register(tabEventId, 'Grace Hopper', { status: 'spam' })
      await register(ownId, 'Other Event Registrant', { status: 'accepted' })
    })

    it('shows the event’s own manager their accepted registrants first', async () => {
      const data = await openTab(assignee)

      expect(data?.registrations.docs).toEqual([
        expect.objectContaining({
          name: 'Ada Lovelace',
          email: 'ada-lovelace@example.com',
          status: 'accepted',
          attending: '5 Aug 2099',
        }),
      ])
      // The answers are the questions asked, never the context the widget sent
      // about itself — `locale` and `userAgent` are not things a visitor typed.
      expect(data?.registrations.docs[0]?.answers).toEqual([
        { label: 'How did you hear about this event?', value: 'A friend' },
        { label: 'Do you have any questions for us?', value: '=SUM(1,1)' },
      ])
      expect(data?.registrations.docs[0]?.registeredOn).toMatch(/^\d{1,2} \w{3} \d{4}$/)
      expect(data?.counts).toEqual({ accepted: 1, pending: 1, withdrawn: 1 })
    })

    it('keeps pending and withdrawn registrations behind their own filters', async () => {
      const names = async (filter: RegistrationQuery['filter']) =>
        (await openTab(assignee, { filter }))?.registrations.docs.map((row) => row.name)

      expect(await names('pending')).toEqual(['Pat Pending'])
      expect(await names('withdrawn')).toEqual(['Grace Hopper'])
    })

    it('refuses every manager but the one the event names', async () => {
      // `owner` manages the region this event sits in, so the Events write
      // scope admits it — and these rows are still not theirs.
      expect(tabEventId).toBeTypeOf('number')

      expect(await openTab(owner)).toBeNull()
      expect(await openTab(stranger)).toBeNull()
    })

    /** The admin shell still admits an inactive manager, so the gate must not. */
    it('refuses the named manager once their account is inactive', async () => {
      const retired = await testData.authUser(
        payload,
        await testData.createManager(payload, { type: 'inactive' }),
      )
      const event = await testData.createEvent(payload, { manager: retired.id, region: cityId })

      expect(
        await loadEventRegistrations(await request(retired), event.id, {
          filter: 'accepted',
          page: 1,
        }),
      ).toBeNull()
    })

    it('shows an admin the same rows', async () => {
      expect((await openTab(admin))?.registrations.docs.map((row) => row.name)).toEqual([
        'Ada Lovelace',
      ])
    })

    /** The tab's pill: only Ada is accepted — pending is not yet confirmed. */
    it('counts accepted registrations for the tab, behind the same gate', async () => {
      const count = async (user: AuthManager) =>
        countAcceptedRegistrations(await request(user), tabEventId)

      expect(await count(assignee)).toBe(1)
      expect(await count(admin)).toBe(1)
      expect(await count(owner)).toBeNull()
      expect(await count(stranger)).toBeNull()
    })

    it('exports the accepted registrants as CSV, refusing anyone else', async () => {
      const path = `/api/events/${tabEventId}/registrations/csv`
      const download = await (await createRestClientAs(env, assignee))(path)

      expect(download.status).toBe(200)
      expect(download.headers.get('content-type')).toContain('text/csv')
      const [header, ...records] = download.raw
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\n')
      expect(header).toBe(
        'Name,Email,Registered on,Attending,How did you hear about this event?,Do you have any questions for us?',
      )
      // Ada alone: Pat is pending and Grace withdrawn. The formula is escaped.
      expect(records).toHaveLength(1)
      expect(records[0]).toMatch(/^Ada Lovelace,ada-lovelace@example\.com,.*,5 Aug 2099,A friend,/)
      expect(records[0]).toContain(`"'=SUM(1,1)"`)
      expect(await acceptedRegistrationsCsv(await request(owner), tabEventId)).toBeNull()

      expect((await (await createRestClientAs(env, owner))(path)).status).toBe(403)
    })

    /**
     * Archiving a long-expired class trashes it, and Payload hides a trashed
     * row from every read that does not ask for it — so without `trash: true`
     * the gate reads the event as absent and refuses its own manager.
     */
    it('still answers for an archived event', async () => {
      const archived = await testData.createEvent(payload, {
        title: 'Archived program',
        manager: assignee.id,
        region: cityId,
      })
      await register(archived.id, 'Archived Registrant', { status: 'accepted' })
      await payload.update({
        collection: 'events',
        id: archived.id,
        data: { deletedAt: new Date().toISOString() },
      })

      const data = await loadEventRegistrations(await request(assignee), archived.id, {
        filter: 'accepted',
        page: 1,
      })
      expect(data?.registrations.docs.map((row) => row.name)).toEqual(['Archived Registrant'])
    })

    /** A `create` screen and a deleted event both reach the route with no row. */
    it('refuses a document id that resolves to no event', async () => {
      const req = await request(admin)
      const query: RegistrationQuery = { filter: 'accepted', page: 1 }

      expect(await loadEventRegistrations(req, 'create', query)).toBeNull()
      expect(await loadEventRegistrations(req, undefined, query)).toBeNull()
    })

    /**
     * The name is the `submissionData` pair, not the `users` row the intake
     * seeds from it — `users` is restricted, and this page reads none of it.
     */
    it('names a registrant from the submission, not from their user row', async () => {
      const user = await payload.find({
        collection: 'users',
        where: { email: { equals: 'ada-lovelace@example.com' } },
        overrideAccess: true,
      })
      await payload.update({
        collection: 'users',
        id: user.docs[0]!.id,
        data: { name: 'Renamed In Users' },
        overrideAccess: true,
      })

      expect((await openTab(assignee))?.registrations.docs[0]?.name).toBe('Ada Lovelace')
    })
  })
})
