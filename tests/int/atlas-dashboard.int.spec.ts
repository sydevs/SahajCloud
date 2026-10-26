import type { Payload } from 'payload'

import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAtlasDashboardData } from '@/components/admin/Dashboard/AtlasDashboard/data'
import { programStatus, type ProgramQuery } from '@/components/admin/Dashboard/AtlasDashboard/model'
import type { Manager as ManagerDoc } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Atlas manager dashboard access', () => {
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
    getAtlasDashboardData(await request(user), { tab: 'all', page: 1, limit: 50, ...query })
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
  it('stores the rank of every save, so the review-first order holds across pages', async () => {
    const event = await testData.createEvent(payload, {
      title: 'Ranked program',
      manager: owner.id,
      region: cityId,
    })
    expect(event.verificationRank).toBe(2)
    const urgent = await payload.update({
      collection: 'events',
      id: event.id,
      context: { skipVerifyHook: true },
      data: { verificationStage: 'urgent' },
    })
    expect(urgent.verificationRank).toBe(0)

    const all = await load(owner)
    const paged = []
    for (let page = 1; page <= all.programs.totalDocs; page++) {
      const data = await load(owner, { page, limit: 1 })
      expect(data.programs.totalPages).toBe(all.programs.totalDocs)
      paged.push(...ids(data))
    }
    expect(paged).toEqual(ids(all))
    const ranks = all.programs.docs.map((program) => programStatus(program))
    expect(ranks.indexOf('finished')).toBeGreaterThan(ranks.lastIndexOf('review'))
  })
})
