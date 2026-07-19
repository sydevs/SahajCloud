import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

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

  describe('confirmation email (#582)', () => {
    /** Capture what the endpoint hands the email adapter. */
    function captureSend() {
      return vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('sends a confirmation to the registrant', async () => {
      const send = captureSend()

      const { status } = await callRegister(eventId, {
        email: 'Confirmed@Example.com',
        name: 'Con Firmed',
      })

      expect(status).toBe(201)
      expect(send).toHaveBeenCalledTimes(1)

      const message = send.mock.calls[0][0] as Record<string, unknown>
      // Normalized address, matching the user upsert.
      expect(message.to).toBe('confirmed@example.com')
      expect(message.subject).toContain('Registrable Event')
      expect(String(message.html)).toContain('Con Firmed')
      // A text alternative alongside the HTML — no template sent one before.
      expect(String(message.text)).toContain('Registrable Event')
      expect(String(message.text)).not.toMatch(/<[a-z]/i)
    })

    it('attaches an importable calendar invite', async () => {
      const send = captureSend()
      await callRegister(eventId, { email: 'cal@example.com', name: 'Cal Endar' })

      const message = send.mock.calls[0][0] as {
        attachments?: { content?: string; contentType?: string; filename?: string }[]
      }
      const invite = message.attachments?.[0]

      expect(invite?.filename).toBe('invite.ics')
      expect(invite?.contentType).toContain('text/calendar')
      expect(invite?.content).toContain('BEGIN:VCALENDAR')
      expect(invite?.content).toContain('BEGIN:VTIMEZONE')
      expect(invite?.content).toContain('DTSTART;TZID=Europe/London')
    })

    it('includes the online join URL as a link and as plain text', async () => {
      const send = captureSend()
      await callRegister(eventId, { email: 'online@example.com', name: 'On Line' })

      const message = send.mock.calls[0][0] as { html?: string; text?: string }
      expect(
        String(message.html).split('https://example.com/meet').length - 1,
      ).toBeGreaterThanOrEqual(2)
      expect(String(message.text)).toContain('https://example.com/meet')
    })

    it('records the originating client and locale on the registration', async () => {
      captureSend()
      const { body } = await callRegister(eventId, {
        email: 'provenance@example.com',
        name: 'Prov Enance',
        locale: 'de',
      })

      const registration = await payload.findByID({
        collection: 'registrations',
        id: body.registration!.id,
        depth: 0,
        overrideAccess: true,
      })

      expect(registration.locale).toBe('de')
      expect(registration.client).toBe(client!.id)
    })

    it('defaults the locale to en when the body omits it', async () => {
      captureSend()
      const { body } = await callRegister(eventId, {
        email: 'nolocale@example.com',
        name: 'No Locale',
      })

      const registration = await payload.findByID({
        collection: 'registrations',
        id: body.registration!.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(registration.locale).toBe('en')
    })

    it('rejects an unsupported locale with 400 rather than silently defaulting', async () => {
      const send = captureSend()
      const { status } = await callRegister(eventId, {
        email: 'badlocale@example.com',
        name: 'Bad Locale',
        locale: 'xx',
      })

      expect(status).toBe(400)
      expect(send).not.toHaveBeenCalled()
    })

    it('uses the client supportEmail as Reply-To when configured', async () => {
      await payload.update({
        collection: 'clients',
        id: client!.id as number,
        data: { supportEmail: 'support@client.example' },
        overrideAccess: true,
      })
      const send = captureSend()

      await callRegister(eventId, { email: 'replyto@example.com', name: 'Reply To' })

      const message = send.mock.calls[0][0] as { replyTo?: string }
      expect(message.replyTo).toBe('support@client.example')

      await payload.update({
        collection: 'clients',
        id: client!.id as number,
        data: { supportEmail: null },
        overrideAccess: true,
      })
    })

    it('strips CRLF from the client name before it becomes a From header', async () => {
      // `Clients.name` is free text and lands in the From display name; a CR/LF
      // there would terminate the header and let the rest be injected as
      // another one (Bcc: being the obvious abuse).
      await payload.update({
        collection: 'clients',
        id: client!.id as number,
        data: { name: 'Evil Co\r\nBcc: attacker@evil.example' },
        overrideAccess: true,
      })
      const send = captureSend()

      await callRegister(eventId, { email: 'header@example.com', name: 'Head Er' })

      const from = String((send.mock.calls[0][0] as { from?: string }).from)
      // The line break is what makes this an injection; the leftover text is
      // inert once it can't start a new header line. Assert the structure holds:
      // one line, the injected text trapped in the display-name position, and
      // the address still ours.
      expect(from).not.toMatch(/[\r\n]/)
      expect(from).toMatch(/^[^<>]*<contact@sydevelopers\.com>$/)

      await payload.update({
        collection: 'clients',
        id: client!.id as number,
        data: { name: 'Atlas Register Client' },
        overrideAccess: true,
      })
    })

    it('strips CRLF from the event title before it becomes the Subject', async () => {
      // The event title is manager-authored free text interpolated into the
      // Subject header — a CR/LF would let the rest be injected as a header.
      await payload.update({
        collection: 'events',
        id: eventId,
        data: { title: 'Registrable Event\r\nBcc: attacker@evil.example' },
        overrideAccess: true,
      })
      const send = captureSend()

      await callRegister(eventId, { email: 'subject@example.com', name: 'Sub Ject' })

      const subject = String((send.mock.calls[0][0] as { subject?: string }).subject)
      expect(subject).not.toMatch(/[\r\n]/)
      expect(subject).toContain('Registrable Event')

      await payload.update({
        collection: 'events',
        id: eventId,
        data: { title: 'Registrable Event' },
        overrideAccess: true,
      })
    })

    it('still returns 201 with the registration persisted when the send fails', async () => {
      // The registrant is already registered — a failed send must not undo that
      // or surface as an error.
      vi.spyOn(payload, 'sendEmail').mockRejectedValue(new Error('smtp exploded'))

      const { status, body } = await callRegister(eventId, {
        email: 'sendfail@example.com',
        name: 'Send Fail',
      })

      expect(status).toBe(201)
      expect(body.ok).toBe(true)

      const registration = await payload.findByID({
        collection: 'registrations',
        id: body.registration!.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(registration.id).toBe(body.registration!.id)
    })
  })
})
