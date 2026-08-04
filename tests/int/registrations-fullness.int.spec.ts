import type { Payload, PayloadRequest } from 'payload'

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'
import type { EventFeature } from '@/collections/Events/endpoints/responseTypes'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type TestUser = { id: number | string; collection: string; _status?: string; roles?: string[] }

const FUTURE_ONE_OFF = {
  firstDate: '2027-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
} as const

describe('registrationsFull signal (#599)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let managerId: number
  let regionId: number
  let userId: number
  let client: TestUser

  async function createEvent(overrides: Record<string, unknown>): Promise<number> {
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title: 'Fullness Event',
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/meet',
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: regionId,
        schedule: FUTURE_ONE_OFF,
        _status: 'published',
        ...overrides,
      }),
    })
    return event.id
  }

  async function addRegistration(eventId: number): Promise<number> {
    const reg = await payload.create({
      collection: 'registrations',
      overrideAccess: true,
      data: { event: eventId, user: userId, uuid: randomUUID() },
    })
    return reg.id
  }

  /** Re-read the stored flag as admin. */
  async function fullFlag(eventId: number): Promise<unknown> {
    const event = await payload.findByID({
      collection: 'events',
      id: eventId,
      depth: 0,
      overrideAccess: true,
    })
    return event.registrationsFull
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Full Manager',
      email: 'full-manager@example.com',
    })
    managerId = manager.id
    const clientDoc = await testData.createClient(payload, managerId, {
      name: 'Atlas Fullness Client',
      roles: ['sahaj-atlas-client'],
    })
    client = {
      id: clientDoc.id,
      collection: 'clients',
      _status: 'published',
      roles: ['sahaj-atlas-client'],
    }
    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name: 'Full City', level: 'city', mapboxId: 'full-city', slug: 'full-city' },
    })
    regionId = region.id
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { name: 'Reg User', email: 'fullness-reg@example.com' },
    })
    userId = user.id
  })

  afterAll(async () => {
    await cleanup()
  })

  it('starts false for a fresh atlas event with a limit and no registrations', async () => {
    const id = await createEvent({ registrationLimit: 2 })
    expect(await fullFlag(id)).toBeFalsy()
  })

  it('flips true when the count reaches the limit and false again when it drops', async () => {
    const id = await createEvent({ registrationLimit: 2 })
    await addRegistration(id)
    expect(await fullFlag(id)).toBeFalsy() // 1 of 2

    const secondReg = await addRegistration(id)
    expect(await fullFlag(id)).toBe(true) // 2 of 2

    await payload.delete({ collection: 'registrations', id: secondReg, overrideAccess: true })
    expect(await fullFlag(id)).toBeFalsy() // back to 1 of 2 → a spot freed
  })

  it('is never full for a blank (unlimited) limit, however many register', async () => {
    const id = await createEvent({ registrationLimit: null })
    await addRegistration(id)
    await addRegistration(id)
    await addRegistration(id)
    expect(await fullFlag(id)).toBeFalsy()
  })

  it('is never full for external registration mode', async () => {
    const id = await createEvent({ registrationMode: 'external', registrationLimit: 1 })
    await addRegistration(id)
    await addRegistration(id)
    expect(await fullFlag(id)).toBeFalsy()
  })

  it('recomputes when a manager changes the limit, and clears when it is blanked', async () => {
    const id = await createEvent({ registrationLimit: null })
    await addRegistration(id)
    await addRegistration(id)
    expect(await fullFlag(id)).toBeFalsy() // unlimited → not full

    // Lower the limit below the current count → becomes full.
    await payload.update({
      collection: 'events',
      id,
      data: { registrationLimit: 2 },
      overrideAccess: true,
    })
    expect(await fullFlag(id)).toBe(true)

    // Blank the limit → unlimited again → clears.
    await payload.update({
      collection: 'events',
      id,
      data: { registrationLimit: null },
      overrideAccess: true,
    })
    expect(await fullFlag(id)).toBeFalsy()
  })

  describe('client read surfaces', () => {
    it('lets sahaj-atlas-client select the boolean on a by-id read (no raw count leaked)', async () => {
      const id = await createEvent({ registrationLimit: 1 })
      await addRegistration(id)

      const doc = await payload.findByID({
        collection: 'events',
        id,
        depth: 0,
        select: { registrationsFull: true },
        overrideAccess: false,
        user: client as unknown as PayloadRequest['user'],
      })
      expect(doc.registrationsFull).toBe(true)
      // A boolean signal, never a number — raw registration counts stay private.
      expect(typeof doc.registrationsFull).toBe('boolean')
    })

    it('exposes registrationsFull on the geojson feed', async () => {
      const id = await createEvent({ registrationLimit: 1 })
      await addRegistration(id)

      const req = {
        payload,
        query: { select: { registrationsFull: true }, depth: 1 },
        headers: new Headers(),
        routeParams: {},
        user: client,
      } as unknown as PayloadRequest
      const response = (await eventsGeoJson.handler(req)) as Response
      const body = (await response.json()) as { features: EventFeature[] }

      const feature = body.features.find((f) => f.id === id)
      expect(feature?.properties.registrationsFull).toBe(true)
    })
  })
})
