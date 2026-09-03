import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

import { registerForEvent } from '@/collections/Events/endpoints/registerForEvent'

import { createData, testData } from '../utils/testData'
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

/**
 * The registration create policy requires Turnstile (#629), so every call in
 * this file carries a token and `verifyMock` is reset to "valid" before each
 * case. The captcha cases below override one or the other deliberately.
 */
const VALID_TURNSTILE = { 'x-turnstile-token': 'tok-valid' }

const SCHEDULE = {
  firstDate: '2025-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const

async function userCountByEmail(payload: Payload, email: string): Promise<number> {
  const { totalDocs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    overrideAccess: true,
    limit: 0,
  })
  return totalDocs
}

async function registrationCountByEmail(payload: Payload, email: string): Promise<number> {
  const { totalDocs } = await payload.find({
    collection: 'registrations',
    where: { 'user.email': { equals: email } },
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
    headers: Record<string, string> = VALID_TURNSTILE,
  ): Promise<{ status: number; body: RegisterBody }> {
    const req = {
      payload,
      headers: new Headers(headers),
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
      data: createData<'events'>({
        title: 'Registrable Event',
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/meet',
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: region.id,
        schedule: SCHEDULE,
        _status: 'published',
      }),
    })
    eventId = event.id
  })

  beforeEach(() => {
    verifyMock.mockReset()
    // Mirror Cloudflare rather than blanket-passing: siteverify answers
    // `missing-input-response` for an empty token, so a stub that ignores its
    // argument would let the "no header" case below pass for the wrong reason.
    verifyMock.mockImplementation(async (token: string) =>
      token
        ? { success: true }
        : { success: false, reason: 'rejected', errorCodes: ['missing-input-response'] },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('captcha gate (#629)', () => {
    const body = { email: 'captcha@example.com', name: 'Cap Tcha' }

    it('refuses a registration with no x-turnstile-token header', async () => {
      const { status, body: res } = await callRegister(eventId, body, client, {})
      expect(status).toBe(403)
      expect(res.errors).toMatchObject([{ code: 'captcha_failed' }])
    })

    it('refuses a token Cloudflare rejects, and says it is retryable', async () => {
      verifyMock.mockResolvedValue({
        success: false,
        reason: 'rejected',
        errorCodes: ['timeout-or-duplicate'],
      })
      const { status, body: res } = await callRegister(eventId, body)
      expect(status).toBe(403)
      expect(res.errors).toMatchObject([{ code: 'captcha_failed' }])
    })

    it('fails closed with 500 when verification cannot be completed', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'not-configured' })
      const { status, body: res } = await callRegister(eventId, body)
      expect(status).toBe(500)
      expect(res.errors).toMatchObject([{ code: 'captcha_unavailable' }])
    })

    it('creates no REGISTRATION when the captcha is refused', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected' })
      const before = await registrationCountByEmail(payload, 'captcha@example.com')
      await callRegister(eventId, body)
      expect(await registrationCountByEmail(payload, 'captcha@example.com')).toBe(before)
    })

    /**
     * The inverse of what this asserted before #673: the registrant row used to
     * survive a refused captcha, because the two writes shared no transaction.
     *
     * The captcha is only the most legible trigger — the guard fires on
     * `registrations.create`, i.e. *after* the `users` row exists — so any late
     * refusal produced the same orphan. The sibling case below covers the
     * validation 400 that did it without any captcha involved.
     */
    it('creates no REGISTRANT either — both writes are one transaction', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected' })
      await callRegister(eventId, body)
      expect(await userCountByEmail(payload, 'captcha@example.com')).toBe(0)
    })
  })

  describe('the two writes are atomic (#673)', () => {
    it('leaves no registrant and no registration when the questions payload is refused', async () => {
      const email = 'orphan-questions@example.com'
      const { status } = await callRegister(eventId, {
        email,
        name: 'Orphan Questions',
        questions: { notAQuestion: 'x' },
      })

      expect(status).toBe(400)
      expect(await userCountByEmail(payload, email)).toBe(0)
      expect(await registrationCountByEmail(payload, email)).toBe(0)
    })

    /**
     * Acceptance criterion 5, and the one that is *not* about the transaction.
     *
     * The registrant insert goes through Drizzle now, to get
     * `ON CONFLICT DO NOTHING` — and a Drizzle-level write runs no Payload
     * hooks, so the write-guard plugin's `users.create` policy would silently
     * stop applying. `upsertUserByEmail` calls the guard explicitly instead;
     * these two cases are what would notice if that call were dropped, since
     * nothing else would fail.
     */
    it('still refuses a disposable registrant address, and stores nothing', async () => {
      const email = 'spammer@mailinator.com'
      const { status, body: res } = await callRegister(eventId, {
        email,
        name: 'Dis Posable',
      })

      expect(status).toBe(400)
      expect(res.errors).toMatchObject([{ code: 'disposable_email' }])
      expect(await userCountByEmail(payload, email)).toBe(0)
    })

    it('still refuses a URL in the registrant name, and stores nothing', async () => {
      const email = 'linky@example.com'
      const { status, body: res } = await callRegister(eventId, {
        email,
        name: 'Buy now at http://spam.example',
      })

      expect(status).toBe(400)
      expect(res.errors).toMatchObject([{ code: 'urls_not_allowed' }])
      expect(await userCountByEmail(payload, email)).toBe(0)
    })

    it('reuses a registrant that already exists rather than conflicting', async () => {
      const email = 'returning@example.com'
      await callRegister(eventId, { email, name: 'Re Turning' })
      await callRegister(eventId, { email, name: 'Re Turning' })

      expect(await userCountByEmail(payload, email)).toBe(1)
      expect(await registrationCountByEmail(payload, email)).toBe(2)
    })
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

  it('returns 400 for an unrecognized registration-question key', async () => {
    // The Registrations.questions field validate rejects keys outside
    // EVENT_REGISTRATION_QUESTIONS; the ValidationError surfaces as a 400.
    const { status, body } = await callRegister(eventId, {
      email: 'badq@example.com',
      name: 'Bad Q',
      questions: { notARealQuestion: 'x' },
    })
    expect(status).toBe(400)
    expect(body).toHaveProperty('errors')
  })

  it('returns 404 for an event the client cannot see', async () => {
    const { status } = await callRegister(999999, {
      email: 'nobody@example.com',
      name: 'No Body',
    })
    expect(status).toBe(404)
  })

  // A finished event stays published (#603), so the published-only access filter
  // above no longer refuses one whose schedule has run out — hence the explicit
  // guard. Without it, registration would succeed for an event that is over.
  it('returns 409 for an event whose schedule has run out', async () => {
    const finished = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title: 'Finished Session',
        eventType: 'online',
        onlineUrl: 'https://example.com/over',
        languages: ['en'],
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: (
          await payload.findByID({ collection: 'events', id: eventId, overrideAccess: true })
        ).region as number,
        // One-off, years past.
        schedule: { firstDate: '2021-03-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
        _status: 'published',
      }),
    })

    const { status, body } = await callRegister(finished.id, {
      email: 'late@example.com',
      name: 'Late Seeker',
    })

    expect(status).toBe(409)
    expect(body).toHaveProperty('errors')
    // Distinct from "not found" — the event is readable, its state just conflicts.
    expect(JSON.stringify(body.errors)).toContain('ended')

    // And nothing was written.
    expect(await userCountByEmail(payload, 'late@example.com')).toBe(0)
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
      // The endpoint also notifies the event manager (#588), so more than one
      // email may send; select the registrant's confirmation (normalized
      // address, matching the user upsert) rather than assuming it's the only one.
      const confirmations = send.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .filter((sent) => sent.to === 'confirmed@example.com')
      expect(confirmations).toHaveLength(1)

      const message = confirmations[0]
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
        data: createData<'events'>({ title: 'Registrable Event\r\nBcc: attacker@evil.example' }),
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
        data: createData<'events'>({ title: 'Registrable Event' }),
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

  describe('manager registration notification (#588)', () => {
    let notifyRegionId: number

    beforeAll(async () => {
      const region = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: { name: 'Notify City', level: 'city', mapboxId: 'notify-city', slug: 'notify-city' },
      })
      notifyRegionId = region.id
    })

    function captureSend() {
      return vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    /**
     * The manager-facing notice(s) among the sends — the registrant confirmation
     * also goes through `payload.sendEmail`, so filter by the notice's subject.
     */
    function managerNotices(send: ReturnType<typeof captureSend>) {
      return send.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .filter(
          (message) =>
            typeof message.subject === 'string' && message.subject.startsWith('New registration'),
        )
    }

    async function createManagerWithFrequency(frequency: string, method = 'email') {
      return testData.createManager(payload, {
        name: `Notify Mgr ${frequency}`,
        notificationPreferences: { event_registration: { frequency, method } },
      })
    }

    async function createNotifyEvent(overrides: Record<string, unknown> = {}) {
      const event = await payload.create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          title: 'Notify Event',
          languages: ['en'],
          eventType: 'online',
          onlineUrl: 'https://example.com/meet',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          region: notifyRegionId,
          schedule: SCHEDULE,
          _status: 'published',
          ...overrides,
        }),
      })
      return event.id
    }

    it('sends one immediate notification to the event manager (override blank)', async () => {
      const send = captureSend()
      const notifyEventId = await createNotifyEvent()

      const { status } = await callRegister(notifyEventId, {
        email: 'seeker1@example.com',
        name: 'Seeker One',
      })
      expect(status).toBe(201)

      const notices = managerNotices(send)
      expect(notices).toHaveLength(1)
      // The shared manager's default preference is Immediate / email.
      expect(notices[0].to).toBe('reg-manager@example.com')
      expect(String(notices[0].subject)).toContain('Notify Event')
      expect(String(notices[0].html)).toContain('Seeker One')
    })

    it("forwards the registrant's question answers to the manager", async () => {
      const send = captureSend()
      const notifyEventId = await createNotifyEvent()

      const { status } = await callRegister(notifyEventId, {
        email: 'seeker-q@example.com',
        name: 'Seeker Q',
        questions: { referral: 'A friend recommended it', questions: 'Yes, two' },
      })
      expect(status).toBe(201)

      const html = String(managerNotices(send)[0]?.html)
      expect(html).toContain('Registration answers')
      expect(html).toContain('How did you hear about this event?')
      expect(html).toContain('A friend recommended it')
      expect(html).toContain('Yes, two')
    })

    it('routes to the override address and sends the manager no copy', async () => {
      const send = captureSend()
      const notifyEventId = await createNotifyEvent({
        registrationNotificationEmail: 'ops@example.org',
        registrationNotificationFrequency: 'Immediate',
      })

      const { status } = await callRegister(notifyEventId, {
        email: 'seeker2@example.com',
        name: 'Seeker Two',
      })
      expect(status).toBe(201)

      const notices = managerNotices(send)
      expect(notices).toHaveLength(1)
      expect(notices[0].to).toBe('ops@example.org')
      // The override replaces the manager — no copy goes to the manager.
      expect(notices.some((message) => message.to === 'reg-manager@example.com')).toBe(false)
    })

    it('sends nothing for a summary frequency (deferred to the digest run)', async () => {
      const send = captureSend()
      const summaryManager = await createManagerWithFrequency('Daily Summary')
      const notifyEventId = await createNotifyEvent({ manager: summaryManager.id })

      const { status } = await callRegister(notifyEventId, {
        email: 'seeker3@example.com',
        name: 'Seeker Three',
      })
      expect(status).toBe(201)
      expect(managerNotices(send)).toHaveLength(0)
    })

    it('sends nothing when the manager frequency is Never', async () => {
      const send = captureSend()
      const neverManager = await createManagerWithFrequency('Never', '')
      const notifyEventId = await createNotifyEvent({ manager: neverManager.id })

      const { status } = await callRegister(notifyEventId, {
        email: 'seeker4@example.com',
        name: 'Seeker Four',
      })
      expect(status).toBe(201)
      expect(managerNotices(send)).toHaveLength(0)
    })

    it('sends nothing when the manager cannot be resolved (no recipient)', async () => {
      // Managers always have an email in practice (auth requires it), so the
      // "no usable destination" branch is reached here by failing the manager
      // lookup; resolveRegistrationRecipient then returns null and nothing sends.
      // The emailless-manager case itself is unit-tested on the resolver.
      const notifyEventId = await createNotifyEvent()
      const originalFindByID = payload.findByID.bind(payload)
      const send = captureSend()
      vi.spyOn(payload, 'findByID').mockImplementation(((args: { collection: string }) =>
        args.collection === 'managers'
          ? Promise.reject(new Error('manager lookup failed'))
          : originalFindByID(
              args as Parameters<typeof originalFindByID>[0],
            )) as typeof payload.findByID)

      const { status } = await callRegister(notifyEventId, {
        email: 'seeker5@example.com',
        name: 'Seeker Five',
      })
      expect(status).toBe(201)
      expect(managerNotices(send)).toHaveLength(0)
    })

    it('still returns 201 when the manager notification send throws', async () => {
      const notifyEventId = await createNotifyEvent()
      // Let the registrant confirmation succeed; only the manager notice throws.
      vi.spyOn(payload, 'sendEmail').mockImplementation(
        (message) =>
          (typeof message.subject === 'string' && message.subject.startsWith('New registration')
            ? Promise.reject(new Error('smtp exploded'))
            : Promise.resolve(undefined)) as ReturnType<typeof payload.sendEmail>,
      )

      const { status, body } = await callRegister(notifyEventId, {
        email: 'seeker6@example.com',
        name: 'Seeker Six',
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

  describe('state-based gating (#599)', () => {
    let gatingRegionId: number
    const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

    beforeAll(async () => {
      const region = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: { name: 'Gate City', level: 'city', mapboxId: 'gate-city', slug: 'gate-city' },
      })
      gatingRegionId = region.id
    })

    async function createGatingEvent(overrides: Record<string, unknown>): Promise<number> {
      const event = await payload.create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          title: 'Gating Event',
          languages: ['en'],
          eventType: 'online',
          onlineUrl: 'https://example.com/meet',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          region: gatingRegionId,
          // A default so the base data typechecks; every gating case overrides it.
          schedule: SCHEDULE,
          _status: 'published',
          ...overrides,
        }),
      })
      return event.id
    }

    it('rejects external-mode registration with external_registration (409)', async () => {
      const id = await createGatingEvent({
        registrationMode: 'external',
        schedule: { firstDate: daysFromNow(30), firstDate_tz: 'Europe/London' },
      })
      const { status, body } = await callRegister(id, {
        email: 'ext@example.com',
        name: 'Ext Ernal',
      })
      expect(status).toBe(409)
      expect((body.errors as { code?: string }[])[0]?.code).toBe('external_registration')
    })

    it('rejects an ended one-off with event_ended (409)', async () => {
      // A one-off whose date is long past → no upcoming occurrences → ended.
      const id = await createGatingEvent({
        schedule: { firstDate: '2020-01-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      })
      const { status, body } = await callRegister(id, { email: 'end@example.com', name: 'End Ed' })
      expect(status).toBe(409)
      expect((body.errors as { code?: string }[])[0]?.code).toBe('event_ended')
    })

    it('rejects a started limited-run course with registration_closed (409)', async () => {
      // Daily run of 8, started 3 days ago → sessions remain (not ended) but the
      // run has begun (firstDate in the past).
      const id = await createGatingEvent({
        schedule: {
          firstDate: daysFromNow(-3),
          firstDate_tz: 'Europe/London',
          recurrenceType: 'DAILY',
          interval: 1,
          endingType: 'count',
          count: 8,
        },
      })
      const { status, body } = await callRegister(id, {
        email: 'closed@example.com',
        name: 'Cl Osed',
      })
      expect(status).toBe(409)
      expect((body.errors as { code?: string }[])[0]?.code).toBe('registration_closed')
    })

    it('never closes a started recurring class with no ending (boundary → 201)', async () => {
      // Same "started" firstDate, but open-ended (no count/until) → never closes.
      const id = await createGatingEvent({
        schedule: {
          firstDate: daysFromNow(-3),
          firstDate_tz: 'Europe/London',
          recurrenceType: 'DAILY',
          interval: 1,
        },
      })
      const { status } = await callRegister(id, {
        email: 'openclass@example.com',
        name: 'Op Enclass',
      })
      expect(status).toBe(201)
    })

    it('rejects registration once a limited event is full with event_full (409)', async () => {
      // Future one-off with room for two → the third is refused.
      const id = await createGatingEvent({
        registrationLimit: 2,
        schedule: { firstDate: daysFromNow(30), firstDate_tz: 'Europe/London' },
      })
      const first = await callRegister(id, { email: 'full1@example.com', name: 'Full One' })
      const second = await callRegister(id, { email: 'full2@example.com', name: 'Full Two' })
      const third = await callRegister(id, { email: 'full3@example.com', name: 'Full Three' })

      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      expect(third.status).toBe(409)
      expect((third.body.errors as { code?: string }[])[0]?.code).toBe('event_full')
    })

    it('leaves the published/visible 404 unchanged for an unreadable event', async () => {
      const { status, body } = await callRegister(999_999, {
        email: 'missing@example.com',
        name: 'Mi Ssing',
      })
      expect(status).toBe(404)
      // The plain not-found carries no machine-readable code (contract preserved).
      expect((body.errors as { code?: string }[])[0]?.code).toBeUndefined()
    })
  })
})
