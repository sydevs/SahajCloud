import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `refuseDeleteWhileInUse` and `deleteChildren` together: a region is deleted
 * with everything beneath it, or not at all. Access (who may delete which
 * region) is `role-based-access`'s.
 */
describe('Deleting a region', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Awaited<ReturnType<typeof createTestEnvironment>>['adminUser']
  let trees = 0

  beforeAll(async () => {
    ;({ payload, cleanup, adminUser: admin } = await createTestEnvironment())
  })

  afterAll(async () => {
    await cleanup()
  })

  /** country > region > city > venue, named after `prefix` so a refusal is legible. */
  const buildTree = async (prefix: string) => {
    trees += 1
    const node = (slug: string, level: string, parent?: number) =>
      testData.createRegionNode(payload, {
        prefix: `delete-${trees}`,
        slug: `${prefix}-${slug}`,
        level,
        parent,
      })
    const country = await node('country', 'country')
    const region = await node('region', 'region', country)
    const city = await node('city', 'city', region)
    const venue = await node('venue', 'venue', city)
    return { country, region, city, venue }
  }

  const remaining = async (ids: number[]) =>
    (await payload.count({ collection: 'regions', where: { id: { in: ids } } })).totalDocs

  /** Deletes as the suite admin through access, so the hook is shown to bind admins too. */
  const refusal = (id: number) =>
    payload.delete({ collection: 'regions', id, user: admin, overrideAccess: false }).then(
      () => null,
      (error: unknown) => error as { status?: number; message: string },
    )

  it('deletes every region beneath it', async () => {
    const { country, region, city, venue } = await buildTree('empty')

    await payload.delete({ collection: 'regions', id: region, overrideAccess: true })

    expect(await remaining([region, city, venue])).toBe(0)
    expect(await remaining([country])).toBe(1)
  })

  it('refuses while an event sits anywhere beneath it, and deletes nothing', async () => {
    const { region, city, venue } = await buildTree('busy')
    await testData.createEvent(payload, { region: venue, manager: admin.id })

    const error = await refusal(region)

    expect(error).toMatchObject({ status: 409 })
    expect(error?.message).toContain('1 event is held in busy-venue')
    expect(await remaining([region, city, venue])).toBe(3)
  })

  it('counts an event in the trash, which would otherwise come back with no region', async () => {
    const { region, city } = await buildTree('archived')
    const event = await testData.createEvent(payload, { region: city, manager: admin.id })
    await payload.update({
      collection: 'events',
      id: event.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    })

    const error = await refusal(region)

    expect(error).toMatchObject({ status: 409 })
    expect(error?.message).toContain('(in the trash)')
  })

  it('names the service whose region is beneath it', async () => {
    const { region, city, venue } = await buildTree('served')
    await testData.createClient(payload, admin.id, {
      label: 'Served Atlas',
      roles: ['sahaj-atlas-client'],
      region: city,
    })

    const error = await refusal(region)

    expect(error).toMatchObject({ status: 409 })
    expect(error?.message).toContain('the service "Served Atlas" has served-city as its region')
    expect(await remaining([region, city, venue])).toBe(3)
  })

  it('deletes a region and a descendant selected together', async () => {
    const { region, city, venue } = await buildTree('together')

    const { errors } = await payload.delete({
      collection: 'regions',
      where: { id: { in: [region, city] } },
      overrideAccess: true,
    })

    expect(errors).toEqual([])
    expect(await remaining([region, city, venue])).toBe(0)
  })
})
