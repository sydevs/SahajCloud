import type { Payload } from 'payload'

import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAtlasDashboardData } from '@/components/admin/AtlasDashboard/data'
import { programGroups } from '@/components/admin/AtlasDashboard/model'
import type { Manager as ManagerDoc } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Atlas organiser dashboard access', () => {
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

  it('includes manageable region drafts but excludes other project-readable events', async () => {
    const data = await getAtlasDashboardData(await request(owner))
    expect(data?.canCreate).toBe(true)
    expect(data?.events.map((event) => event.id)).toEqual([ownId])
    const groups = programGroups(data!.events)
    // The one event is an urgent draft, so it is awaiting review and nothing else.
    expect(groups.review).toHaveLength(1)
    expect(groups.drafts).toEqual([])
  })
  it('supports direct assignment without granting creation', async () => {
    const data = await getAtlasDashboardData(await request(assignee))
    expect(data?.canCreate).toBe(false)
    expect(data?.events.map((event) => event.id)).toEqual([assignedId])
  })
  it('does not load organiser data for other project contexts', async () => {
    expect(
      await getAtlasDashboardData(await request({ ...owner, currentProject: 'wemeditate-web' })),
    ).toBeNull()
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
    const data = await getAtlasDashboardData(await request(owner))
    const program = data?.events.find((event) => event.id === live.id)
    expect(program).toMatchObject({ title: 'Changed title', _status: 'draft', published: true })
    expect(data?.events.find((event) => event.id === draft.id)).toMatchObject({
      verificationStage: 'verified',
      published: false,
    })
    const groups = programGroups(data!.events)
    expect(groups.published.map((event) => event.id)).toEqual([live.id])
    expect(groups.drafts.map((event) => event.id)).toEqual([draft.id])
    expect(groups.review.map((event) => event.id)).toEqual([ownId])
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
      const data = await getAtlasDashboardData(await request(owner))
      expect(data?.events.find((event) => event.id === live.id)).toMatchObject({
        verificationStage: stage,
        published: true,
        _status: 'draft',
      })
      if (stage === 'urgent') expect(data?.events[0].id).toBe(live.id)
      else expect(data?.events.at(-1)?.id).toBe(live.id)
    },
  )
})
