import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

// Registration requires Turnstile since #629. This spec is about origins, so it
// holds the captcha permanently valid rather than exercising it — the gate's own
// cases live in `event-registration.int.spec.ts`.
vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))
verifyMock.mockResolvedValue({ success: true })

import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * End-to-end wiring for `validateClientOriginHook` (added by the usage plugin to
 * every non-excluded collection). The pure matching/normalization logic is
 * covered in `tests/unit/origin-enforcement.spec.ts`. Here we prove the hook
 * fires through `payload.find` and the custom Atlas endpoints, and that a
 * disallowed origin yields a 403.
 *
 * `req.user.site.domain` is set on the mock user exactly as production provides
 * it — the API-key auth loads the full client doc as `req.user`, and the hook
 * only reads that field (it never re-queries). A service is one site: its domain
 * and that domain's www twin, and no other browser origin.
 */
const SCHEDULE = {
  firstDate: '2025-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const

describe('client Origin/Referer enforcement', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let clientId: number
  let managerId: number
  let narratorId: number
  let eventId: number

  // Build a client request for a service on `domain`, with origin/referer headers.
  function clientReq(opts: {
    domain?: string | null
    origin?: string
    referer?: string
  }): PayloadRequest {
    const headers = new Headers({ 'x-turnstile-token': 'tok-valid' })
    if (opts.origin) headers.set('origin', opts.origin)
    if (opts.referer) headers.set('referer', opts.referer)
    return {
      payload,
      headers,
      routeParams: {},
      user: {
        id: clientId,
        collection: 'clients',
        enabled: true,
        roles: ['sahaj-atlas-client'],
        site: { domain: opts.domain ?? null },
      },
    } as unknown as PayloadRequest
  }

  // A valid client read (origin allowed → query validation runs next, so select
  // is required). Narrators is a plain usage-wrapped collection.
  const findNarrators = (req: PayloadRequest) =>
    payload.find({
      collection: 'narrators',
      select: { name: true },
      depth: 1,
      req,
      overrideAccess: true,
    })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Origin Manager',
      email: 'origin-manager@example.com',
    })
    managerId = manager.id
    const clientDoc = await testData.createClient(payload, managerId, {
      name: 'Atlas Origin Client',
      roles: ['sahaj-atlas-client'],
    })
    clientId = clientDoc.id

    const narrator = await testData.createNarrator(payload)
    narratorId = narrator.id

    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name: 'Origin City', level: 'city', mapboxId: 'origin-city', slug: 'origin-city' },
    })
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title: 'Origin Event',
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

  afterAll(async () => {
    await cleanup()
  })

  describe('a service with a domain', () => {
    const domain = 'allowed.org'

    it('rejects with 403 when the Origin host is another site', async () => {
      await expect(
        findNarrators(clientReq({ domain, origin: 'https://evil.org' })),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('allows when the Origin host is the domain', async () => {
      const result = await findNarrators(clientReq({ domain, origin: 'https://allowed.org' }))
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('allows the www twin of the domain, both ways round', async () => {
      const www = await findNarrators(clientReq({ domain, origin: 'https://www.allowed.org' }))
      expect(www.docs.map((d) => d.id)).toContain(narratorId)
      const apex = await findNarrators(
        clientReq({ domain: 'www.allowed.org', origin: 'https://allowed.org' }),
      )
      expect(apex.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('rejects any other subdomain — one domain, no wildcards', async () => {
      await expect(
        findNarrators(clientReq({ domain, origin: 'https://sub.allowed.org' })),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('allows when only the Referer matches (no Origin header)', async () => {
      const result = await findNarrators(
        clientReq({ domain, referer: 'https://allowed.org/widget?x=1' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('allows when no Origin/Referer is present (server-to-server)', async () => {
      const result = await findNarrators(clientReq({ domain }))
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })
  })

  describe('a service with no domain', () => {
    it('allows any origin — an app key has no browser origin to check', async () => {
      const result = await findNarrators(
        clientReq({ domain: null, origin: 'https://anything.example' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })
  })

  describe('custom Atlas endpoints', () => {
    const domain = 'allowed.org'

    it('geojson: 403 for a disallowed origin', async () => {
      const req = clientReq({ domain, origin: 'https://evil.org' })
      req.query = { select: { title: true }, depth: 1 }
      const res = (await eventsGeoJson.handler(req)) as Response
      expect(res.status).toBe(403)
    })

    it('geojson: 200 for an allowed origin', async () => {
      const req = clientReq({ domain, origin: 'https://allowed.org' })
      req.query = { select: { title: true }, depth: 1 }
      const res = (await eventsGeoJson.handler(req)) as Response
      expect(res.status).toBe(200)
    })

    // Registration is a collection create since #800, so it is the hook's
    // ordinary path rather than an endpoint's — kept here because this is where
    // the Atlas widget's own write is covered.
    const register = (req: PayloadRequest, email: string) =>
      payload.create({
        collection: 'user-submissions',
        data: createData<'user-submissions'>({
          type: 'registration',
          event: eventId,
          senderEmail: email,
        }),
        req,
      })

    it('register: 403 for a disallowed origin', async () => {
      await expect(
        register(clientReq({ domain, origin: 'https://evil.org' }), 'reg@evil.org'),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('register: created for an allowed origin', async () => {
      // `example.com`, not `allowed.org`: the write-guard's disposable-email list
      // (mailchecker) happens to blacklist allowed.org, and this test is about
      // origins, not email screening.
      const doc = await register(
        clientReq({ domain, origin: 'https://allowed.org' }),
        'reg@example.com',
      )
      expect(doc.uuid).toBeTruthy()
    })
  })
})
