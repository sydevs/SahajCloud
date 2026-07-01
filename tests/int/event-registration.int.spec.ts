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
    id: number | string,
    body: unknown,
    user: TestUser = client,
  ): Promise<{ status: number; body: RegisterBody }> {
    const req = {
      payload,
      headers: new Headers(),
      routeParams: { id: String(id) },
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
    const body = { email: 'a@b.com', name: 'A B' }

    it('rejects unauthenticated callers with 403', async () => {
      const { status } = await callRegister(eventId, body, null)
      expect(status).toBe(403)
    })

    it('rejects managers with 403', async () => {
      const { status } = await callRegister(eventId, body, {
        id: managerId,
        collection: 'managers',
      })
      expect(status).toBe(403)
    })

    it('rejects unpublished (draft) clients with 403', async () => {
      const { status } = await callRegister(eventId, body, {
        id: client!.id,
        collection: 'clients',
        _status: 'draft',
        roles: ['sahaj-atlas-client'],
      })
      expect(status).toBe(403)
    })
  })

  it('returns 400 for a non-numeric event id', async () => {
    const { status } = await callRegister('not-a-number', { email: 'x@y.com', name: 'X Y' })
    expect(status).toBe(400)
  })

  it('returns 400 when the body fails validation', async () => {
    const { status, body } = await callRegister(eventId, { name: 'No Email' })
    expect(status).toBe(400)
    expect(body).toHaveProperty('errors')
  })

  it('returns 400 when the questions payload exceeds the size bound', async () => {
    const { status } = await callRegister(eventId, {
      email: 'huge@example.com',
      name: 'Huge Payload',
      questions: { blob: 'x'.repeat(11_000) },
    })
    expect(status).toBe(400)
  })

  it('returns 404 for an event the client cannot see', async () => {
    const { status } = await callRegister(999999, {
      email: 'nobody@example.com',
      name: 'No Body',
    })
    expect(status).toBe(404)
  })

  it('creates a registrant + registration and returns 201', async () => {
    const { status, body } = await callRegister(eventId, {
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
    const first = await callRegister(eventId, { email, name: 'Repeat One' })
    const second = await callRegister(eventId, { email: 'REPEAT@example.com', name: 'Repeat Two' })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    // Same registrant despite the casing difference → only one user row.
    expect(await userCountByEmail(payload, email)).toBe(1)
    expect(first.body.registration!.id).not.toBe(second.body.registration!.id)
  })

  describe('mailing-list consent (subscribe)', () => {
    async function subscribedAtFor(id: number): Promise<unknown> {
      const registration = await payload.findByID({
        collection: 'registrations',
        id,
        depth: 0,
        overrideAccess: true,
      })
      return registration.mailingListSubscribedAt
    }

    it('stamps mailingListSubscribedAt at registration time when subscribe is true', async () => {
      const before = Date.now()
      const { status, body } = await callRegister(eventId, {
        email: 'consenting@example.com',
        name: 'Con Senting',
        subscribe: true,
      })
      expect(status).toBe(201)

      const stamped = await subscribedAtFor(body.registration!.id)
      expect(stamped).toBeTruthy()
      const stampedAt = new Date(stamped as string).getTime()
      expect(stampedAt).toBeGreaterThanOrEqual(before)
      expect(stampedAt).toBeLessThanOrEqual(Date.now() + 1000)
    })

    it('leaves mailingListSubscribedAt unset when subscribe is false', async () => {
      const { status, body } = await callRegister(eventId, {
        email: 'declining@example.com',
        name: 'De Clining',
        subscribe: false,
      })
      expect(status).toBe(201)
      expect(await subscribedAtFor(body.registration!.id)).toBeFalsy()
    })

    it('leaves mailingListSubscribedAt unset when subscribe is absent', async () => {
      const { status, body } = await callRegister(eventId, {
        email: 'silent@example.com',
        name: 'Si Lent',
      })
      expect(status).toBe(201)
      expect(await subscribedAtFor(body.registration!.id)).toBeFalsy()
    })

    it('ignores a client-supplied mailingListSubscribedAt (stamped server-side)', async () => {
      // Consent is stamped server-side; a body-supplied value must never be
      // honored, or a caller could backdate/forge consent. The field isn't in
      // the schema (Zod drops it) — this locks that guarantee in against a future
      // refactor that trusts the body.
      const before = Date.now()
      const { status, body } = await callRegister(eventId, {
        email: 'injector@example.com',
        name: 'In Jector',
        subscribe: true,
        mailingListSubscribedAt: '2020-01-01T00:00:00.000Z',
      })
      expect(status).toBe(201)

      const stamped = await subscribedAtFor(body.registration!.id)
      // Server time (>= before), never the injected 2020 value.
      expect(new Date(stamped as string).getTime()).toBeGreaterThanOrEqual(before)
    })
  })
})
