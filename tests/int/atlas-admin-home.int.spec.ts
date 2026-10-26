import type { Payload, PayloadRequest } from 'payload'

import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAtlasAdminHomeData } from '@/components/admin/Dashboard/AtlasAdminHome/data'
import type { Manager } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Atlas admin home', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let manager: Manager

  const systemReq = () =>
    ({
      payload,
      context: { skipWriteGuard: true },
      headers: new Headers(),
    }) as unknown as PayloadRequest
  const overview = async () =>
    getAtlasAdminHomeData(
      await createLocalReq({ user: { ...admin, collection: 'managers' }, locale: 'en' }, payload),
    )
  const countOf = (items: { label: string; count: number }[], label: string) =>
    items.find((item) => item.label === label)?.count

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser
    manager = await testData.createManager(payload, { type: 'manager', roles: ['atlas-manager'] })
  })
  afterAll(async () => cleanup())

  it('counts unadopted events and unmanaged countries, each linking to its rows', async () => {
    const before = await overview()
    const country = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({ name: 'Overview Country', level: 'country', mapboxId: 'c.ov' }),
    })
    const city = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name: 'Managed City',
        level: 'city',
        parent: country.id,
        managers: [manager.id],
        mapboxId: 'city.ov-managed',
      }),
    })
    // Unadopted: imported and unverified, with no manager.
    await testData.createEvent(payload, {
      title: 'Unadopted',
      region: city.id,
      manager: null,
      verificationStage: 'unverified',
    })
    await testData.createEvent(payload, { title: 'Owned', region: city.id, manager: manager.id })

    const after = await overview()
    const delta = (label: string) =>
      countOf(after.attention, label)! - countOf(before.attention, label)!
    expect(delta('Imported, not adopted')).toBe(1)
    // Only countries count: the new country has no manager, and the city would
    // not count even without its own.
    expect(delta('Countries with no manager')).toBe(1)
    expect(after.attention.map((item) => item.href)).toEqual([
      expect.stringMatching(/^\/admin\/collections\/events\?where/),
      expect.stringMatching(/^\/admin\/collections\/regions\?where/),
      expect.stringMatching(/^\/admin\/collections\/user-submissions\?where/),
    ])
    expect(countOf(after.health, 'Verified')! - countOf(before.health, 'Verified')!).toBe(1)
    expect(after.recent.map((event) => event.title)).toEqual(
      expect.arrayContaining(['Unadopted', 'Owned']),
    )
    expect(after.recent.find((event) => event.title === 'Owned')?.regionName).toBe('Managed City')
  })

  it('counts only proposals still open for review', async () => {
    const proposals = async () =>
      countOf((await overview()).attention, 'Proposals awaiting review')!
    const before = await proposals()
    const propose = async (status?: 'accepted') => {
      const row = await payload.create({
        collection: 'user-submissions',
        data: {
          type: 'proposal',
          senderEmail: 'proposer@example.com',
          proposed: { title: 'Thursday class' },
          submissionData: [],
        } as never,
        overrideAccess: true,
        req: systemReq(),
      })
      if (status) {
        await payload.update({
          collection: 'user-submissions',
          id: row.id,
          data: { status } as never,
          overrideAccess: true,
          req: systemReq(),
        })
      }
    }
    await propose()
    await propose('accepted')
    expect((await proposals()) - before).toBe(1)
  })
})
