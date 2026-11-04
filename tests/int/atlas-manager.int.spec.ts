import type { Payload } from 'payload'

import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAtlasManagerData } from '@/components/admin/Dashboard/AtlasManager/data'
import { programStatus, type ProgramQuery } from '@/components/admin/Dashboard/AtlasManager/model'
import {
  countActiveRegistrations,
  loadEventRegistrations,
} from '@/components/admin/EventRegistrations/data'
import type { RegistrationQuery } from '@/components/admin/EventRegistrations/data'
import type { Manager as ManagerDoc } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Atlas manager home', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let owner: ManagerDoc
  let assignee: ManagerDoc
  let ownId: number
  let cityId: number
  let assignedId: number
  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    owner = await testData.createManager(payload, {
      type: 'manager',
      roles: ['atlas-manager'],
      currentProject: 'sahaj-atlas',
    })
    assignee = await testData.createManager(payload, {
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
        managers: [owner.id],
        mapboxId: 'city.dashboard',
      }),
    })
    cityId = city.id
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
    const assigned = await payload.create({
      collection: 'events',
      draft: true,
      data: {
        title: 'Assigned draft',
        region: otherCity.id,
        manager: assignee.id,
        eventType: 'offline',
      },
    })
    assignedId = assigned.id
    await payload.create({
      collection: 'events',
      draft: true,
      data: { title: 'Unrelated draft', region: otherCity.id, eventType: 'offline' },
    })
  })
  afterAll(async () => cleanup())
  const request = (user: ManagerDoc) =>
    createLocalReq({ user: { ...user, collection: 'managers' }, locale: 'en' }, payload)
  const load = async (user: ManagerDoc, query: Partial<ProgramQuery> = {}) =>
    getAtlasManagerData(await request(user), { tab: 'all', page: 1, limit: 50, ...query })
  const ids = (data: { programs: { docs: { id: number }[] } }) =>
    data.programs.docs.map((event) => event.id)

  it('includes manageable region drafts but excludes other project-readable events', async () => {
    const data = await load(owner)
    expect(data.canCreate).toBe(true)
    expect(ids(data)).toEqual([ownId])
    // The one event is an urgent draft, so it is awaiting review and nothing else.
    expect(data.counts).toEqual({ all: 1, review: 1, drafts: 0 })
  })
  it('supports direct assignment without granting creation', async () => {
    const data = await load(assignee)
    expect(data.canCreate).toBe(false)
    expect(ids(data)).toEqual([assignedId])
  })
  it('answers from the Events write scope and not from the current project', async () => {
    // The Events `update` scope is regions and assignment, so it admits the same
    // programs whatever project is selected. That is why containment to Sahaj
    // Atlas belongs to `dashboardChoiceFor`, which decides whether this view
    // renders at all — never to this read.
    const elsewhere = await load({ ...owner, currentProject: 'wemeditate-web' })
    expect(ids(elsewhere)).toEqual([ownId])
  })
  it('distinguishes a never-published draft from unpublished changes to a live program', async () => {
    const live = await testData.createEvent(payload, {
      title: 'Live program',
      manager: owner.id,
      region: cityId,
      _status: 'published',
    })
    await payload.update({
      collection: 'events',
      id: live.id,
      draft: true,
      data: { title: 'Changed title' },
    })
    // Verified, so it lands in `drafts` for never having been published rather
    // than for its stage — which is the only reason `ownId` is in `review`.
    const draft = await payload.create({
      collection: 'events',
      draft: true,
      data: {
        title: 'Never published draft',
        region: cityId,
        manager: owner.id,
        eventType: 'offline',
      },
    })
    const data = await load(owner)
    const program = data.programs.docs.find((event) => event.id === live.id)
    expect(program).toMatchObject({ title: 'Changed title', _status: 'draft', published: true })
    expect(programStatus(program!)).toBe('published')
    expect(data.programs.docs.find((event) => event.id === draft.id)).toMatchObject({
      verificationStage: 'verified',
      published: false,
    })
    expect(ids(await load(owner, { tab: 'drafts' }))).toEqual([draft.id])
    expect(ids(await load(owner, { tab: 'review' }))).toEqual([ownId])
  })
  it.each(['urgent', 'finished'] as const)(
    'uses the live %s stage when a draft save resets verification',
    async (stage) => {
      const live = await testData.createEvent(payload, {
        title: `Live ${stage} program`,
        manager: owner.id,
        region: cityId,
        _status: 'published',
      })
      await payload.update({
        collection: 'events',
        id: live.id,
        context: { skipVerifyHook: true },
        data: { verificationStage: stage },
      })
      await payload.update({
        collection: 'events',
        id: live.id,
        draft: true,
        data: {
          title: `Draft ${stage} program`,
          schedule: { firstDate: '2099-10-23T10:00:00.000Z', firstDate_tz: 'Europe/London' },
        },
      })
      const latest = await payload.findByID({ collection: 'events', id: live.id, draft: true })
      const base = await payload.findByID({ collection: 'events', id: live.id, draft: false })
      expect(latest.verificationStage).toBe('verified')
      expect(base.verificationStage).toBe(stage)
      const data = await load(owner)
      expect(data.programs.docs.find((event) => event.id === live.id)).toMatchObject({
        verificationStage: stage,
        published: true,
        _status: 'draft',
      })
      if (stage === 'urgent') expect(data.programs.docs[0]!.id).toBe(live.id)
      else expect(data.programs.docs.at(-1)?.id).toBe(live.id)
    },
  )
  it('pages the review-first order without reordering it', async () => {
    const urgent = await testData.createEvent(payload, {
      title: 'Newly urgent program',
      manager: owner.id,
      region: cityId,
    })
    await payload.update({
      collection: 'events',
      id: urgent.id,
      context: { skipVerifyHook: true },
      data: { verificationStage: 'urgent' },
    })

    const all = await load(owner)
    expect(all.programs.docs[0]!.verificationStage).toBe('urgent')
    const paged = []
    for (let page = 1; page <= all.programs.totalDocs; page++) {
      const data = await load(owner, { page, limit: 1 })
      expect(data.programs.totalPages).toBe(all.programs.totalDocs)
      paged.push(...ids(data))
    }
    expect(paged).toEqual(ids(all))
    const statuses = all.programs.docs.map((program) => programStatus(program))
    expect(statuses.indexOf('finished')).toBeGreaterThan(statuses.lastIndexOf('review'))
    // A page past the end clamps to the last one rather than coming back empty.
    expect(ids(await load(owner, { page: 999, limit: 1 }))).toEqual([ids(all).at(-1)])
  })

  /**
   * The event's own Registrations tab (#1069). Nested so it shares the one
   * environment this file may create (`tests/AGENTS.md`), and declared last so
   * its fixtures cannot reach the cases above.
   */
  describe('Event registrations tab', () => {
    let tabEventId: number
    let admin: ManagerDoc
    let stranger: ManagerDoc

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

    const openTab = async (user: ManagerDoc, query: Partial<RegistrationQuery> = {}) =>
      loadEventRegistrations(await request(user), tabEventId, {
        filter: 'active',
        page: 1,
        ...query,
      })

    beforeAll(async () => {
      admin = await testData.createManager(payload, { type: 'admin' })
      stranger = await testData.createManager(payload, {
        type: 'manager',
        roles: ['atlas-manager'],
        currentProject: 'sahaj-atlas',
      })
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
        { startingAt: '2099-08-05T18:00:00.000Z' },
        {
          referral: 'A friend',
          locale: 'fr',
          userAgent: 'Mozilla/5.0',
        },
      )
      await register(tabEventId, 'Grace Hopper', { status: 'spam' })
      await register(ownId, 'Other Event Registrant')
    })

    it('shows the event’s own manager their registrants, active first', async () => {
      const data = await openTab(assignee)

      expect(data?.registrations.docs).toEqual([
        expect.objectContaining({
          name: 'Ada Lovelace',
          email: 'ada-lovelace@example.com',
          status: 'pending',
          attending: '5 Aug 2099',
        }),
      ])
      // The answers are the questions asked, never the context the widget sent
      // about itself — `locale` and `userAgent` are not things a visitor typed.
      expect(data?.registrations.docs[0]?.answers).toEqual([
        { label: 'How did you hear about this event?', value: 'A friend' },
      ])
      expect(data?.registrations.docs[0]?.registeredOn).toMatch(/^\d{1,2} \w{3} \d{4}$/)
    })

    it('keeps a withdrawn registration behind its own filter', async () => {
      const withdrawn = await openTab(assignee, { filter: 'withdrawn' })

      expect(withdrawn?.registrations.docs.map((row) => row.name)).toEqual(['Grace Hopper'])
      expect(withdrawn?.registrations.docs[0]?.status).toBe('spam')
    })

    it('refuses every manager but the one the event names', async () => {
      // `owner` manages the region this event sits in, so the dashboard offers
      // it to them for editing — and these rows are still not theirs.
      expect(ids(await load(owner))).toContain(tabEventId)

      expect(await openTab(owner)).toBeNull()
      expect(await openTab(stranger)).toBeNull()
    })

    it('shows an admin the same rows', async () => {
      expect((await openTab(admin))?.registrations.docs.map((row) => row.name)).toEqual([
        'Ada Lovelace',
      ])
    })

    /** The tab's pill: the `spam` row is withdrawn, so only Ada counts. */
    it('counts active registrations for the tab, behind the same gate', async () => {
      const count = async (user: ManagerDoc) =>
        countActiveRegistrations(await request(user), tabEventId)

      expect(await count(assignee)).toBe(1)
      expect(await count(admin)).toBe(1)
      expect(await count(owner)).toBeNull()
      expect(await count(stranger)).toBeNull()
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
      await register(archived.id, 'Archived Registrant')
      await payload.update({
        collection: 'events',
        id: archived.id,
        data: { deletedAt: new Date().toISOString() },
      })

      const data = await loadEventRegistrations(await request(assignee), archived.id, {
        filter: 'active',
        page: 1,
      })
      expect(data?.registrations.docs.map((row) => row.name)).toEqual(['Archived Registrant'])
    })

    /** A `create` screen and a deleted event both reach the route with no row. */
    it('refuses a document id that resolves to no event', async () => {
      const req = await request(admin)

      expect(await loadEventRegistrations(req, 'create', { filter: 'active', page: 1 })).toBeNull()
      expect(await loadEventRegistrations(req, undefined, { filter: 'active', page: 1 })).toBeNull()
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
