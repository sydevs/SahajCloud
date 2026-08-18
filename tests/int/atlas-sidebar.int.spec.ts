import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildAtlasSidebarData } from '@/lib/atlasSidebar/getAtlasSidebarData'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Integration coverage for the Atlas sidebar data builder — the query layer
 * (trash inclusion on the event list, owned-region subtree resolution, the
 * published/total count predicates). The bucketing/ordering/rollup maths is
 * unit-tested in `tests/unit/atlas-sidebar-model.spec.ts`.
 */
describe('Atlas sidebar data builder', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let managerId: number
  let regionName: string
  let cityName: string

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, { name: 'Sidebar Manager', roles: [] })
    managerId = manager.id

    const createRegion = (data: Record<string, unknown>) =>
      payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          level: 'country',
          name: 'Region',
          mapboxId: `place.${Math.random().toString(36).slice(2)}`,
          ...data,
        }),
        depth: 0,
      })

    // country > region (owned by manager) > city. The manager owns `region`,
    // so the subtree is { region, city } and excludes `country`.
    const country = await createRegion({ level: 'country', name: 'Sidebaria' })
    const region = await createRegion({
      level: 'region',
      name: 'Owned North',
      parent: country.id,
      managers: [managerId],
    })
    regionName = 'Owned North'
    const city = await createRegion({ level: 'city', name: 'Owned Capital', parent: region.id })
    cityName = 'Owned Capital'

    const createEvent = (data: Record<string, unknown>) =>
      payload.create({
        collection: 'events',
        draft: true,
        // skip the verify hook so the explicit verificationStage sticks.
        context: { skipVerifyHook: true },
        data: {
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          ...data,
        },
        depth: 0,
      })

    // The manager's own events span three buckets. All sit in `city`.
    await createEvent({ title: 'Urgent One', region: city.id, verificationStage: 'urgent' })
    await createEvent({ title: 'Verified One', region: city.id, verificationStage: 'verified' })
    // A pre-adoption event in the subtree with NO manager: it must still show
    // up in the sidebar (that's the adoption surface) via the region branch of
    // the event-list query, bucketed with the needs-verification events.
    await createEvent({
      title: 'Unverified Orphan',
      region: city.id,
      manager: null,
      verificationStage: 'unverified',
    })
    const trashed = await createEvent({
      title: 'Trashed One',
      region: city.id,
      verificationStage: 'verified',
    })
    // Soft-delete (set deletedAt) → "Trashed" bucket; excluded from region
    // counts. This mirrors how ExpireEvents trashes events.
    await payload.update({
      collection: 'events',
      id: trashed.id,
      context: { skipVerifyHook: true },
      data: { deletedAt: new Date().toISOString() },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('lists the manager + subtree events bucket-ordered, including the trashed one', async () => {
    const { events } = await buildAtlasSidebarData(managerId, 'en')
    expect(events.map((event) => event.bucket)).toEqual([
      'urgent',
      'needsVerification',
      'verified',
      'trashed',
    ])
    expect(events.map((event) => event.title)).toEqual([
      'Urgent One',
      'Unverified Orphan',
      'Verified One',
      'Trashed One',
    ])
  })

  it('builds the owned-region subtree with rolled-up counts (trashed excluded)', async () => {
    const { regions } = await buildAtlasSidebarData(managerId, 'en')

    // Root is the owned region (its parent `country` is outside the subtree).
    expect(regions).toHaveLength(1)
    const [root] = regions
    expect(root.name).toBe(regionName)
    expect(root.children.map((child) => child.name)).toEqual([cityName])

    // Three non-trashed events in the subtree (incl. the managerless
    // unverified one); all drafts, so none published. Counts roll up from the
    // city to its parent.
    expect(root.counts).toEqual({ published: 0, total: 3 })
    expect(root.children[0].counts).toEqual({ published: 0, total: 3 })
  })
})
