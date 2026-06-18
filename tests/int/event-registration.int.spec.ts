import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { registerForEvent } from '@/collections/Events/endpoints/registerForEvent'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type TestUser = {
  id: number | string
  collection: string
  _status?: 'published' | 'draft'
  roles?: string[]
} | null

type RegisterBody = {
  ok?: boolean
  registration?: { id: number; uuid: string }
  errors?: unknown
}

const SCHEDULE = {
  firstDate: '2025-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY' as const,
  interval: 1,
}

async function userCountByEmail(payload: Payload, email: string): Promise<number> {
  const { totalDocs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    overrideAccess: true,
    limit: 0,
  })
  return totalDocs
}

describe('registerForEvent endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let client: TestUser
  let managerId: number
  let eventId: number

  async function callRegister(
    body: unknown,
    user: TestUser = client,
  ): Promise<{ status: number; body: RegisterBody }> {
    const req = {
      payload,
      headers: new Headers(),
      routeParams: {},
      user,
      json: async () => body,
    } as unknown as PayloadRequest
    const response = (await registerForEvent.handler(req)) as Response
    return { status: response.status, body: await response.json() }
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Reg Manager',
      email: 'reg-manager@example.com',
    })
    managerId = manager.id
    const clientDoc = await testData.createClient(payload, managerId, {
      name: 'Atlas Register Client',
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
      data: { name: 'Reg City', level: 'city', mapboxId: 'reg-city', slug: 'reg-city' },
    })
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        title: 'Registrable Event',
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/meet',
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: region.id,
        schedule: SCHEDULE,
        _status: 'published',
      },
    })
    eventId = event.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('auth gate', () => {
    const body = { event: 1, email: 'a@b.com', name: 'A B' }

    it('rejects unauthenticated callers with 403', async () => {
      const { status } = await callRegister(body, null)
      expect(status).toBe(403)
    })

    it('rejects managers with 403', async () => {
      const { status } = await callRegister(body, { id: managerId, collection: 'managers' })
      expect(status).toBe(403)
    })

    it('rejects unpublished (draft) clients with 403', async () => {
      const { status } = await callRegister(body, {
        id: client!.id,
        collection: 'clients',
        _status: 'draft',
        roles: ['sahaj-atlas-client'],
      })
      expect(status).toBe(403)
    })
  })

  it('returns 400 when the body fails validation', async () => {
    const { status, body } = await callRegister({ event: eventId, name: 'No Email' })
    expect(status).toBe(400)
    expect(body).toHaveProperty('errors')
  })

  it('returns 404 for an event the client cannot see', async () => {
    const { status } = await callRegister({
      event: 999999,
      email: 'nobody@example.com',
      name: 'No Body',
    })
    expect(status).toBe(404)
  })

  it('creates a registrant + registration and returns 201', async () => {
    const { status, body } = await callRegister({
      event: eventId,
      email: 'Registrant@Example.com',
      name: 'Reg Istrant',
      startingAt: '2025-02-01T18:00:00.000Z',
      questions: { experience: 'none' },
    })
    expect(status).toBe(201)
    expect(body.ok).toBe(true)
    expect(typeof body.registration?.uuid).toBe('string')

    // Registrant upserted by normalized (lowercased) email.
    expect(await userCountByEmail(payload, 'registrant@example.com')).toBe(1)

    const registration = await payload.findByID({
      collection: 'registrations',
      id: body.registration!.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(registration.event).toBe(eventId)
    expect(registration.uuid).toBe(body.registration!.uuid)
  })

  it('reuses an existing registrant on a second registration (upsert by email)', async () => {
    const email = 'repeat@example.com'
    const first = await callRegister({ event: eventId, email, name: 'Repeat One' })
    const second = await callRegister({
      event: eventId,
      email: 'REPEAT@example.com',
      name: 'Repeat Two',
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    // Same registrant despite the casing difference → only one user row.
    expect(await userCountByEmail(payload, email)).toBe(1)
    expect(first.body.registration!.id).not.toBe(second.body.registration!.id)
  })
})
