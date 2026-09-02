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
import { registerForEvent } from '@/collections/Events/endpoints/registerForEvent'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * End-to-end wiring for `validateClientOriginHook` (added by the usage plugin to
 * every non-excluded collection). The pure matching/normalization logic is
 * covered in `tests/unit/origin-enforcement.spec.ts`; here we prove the hook
 * fires through `payload.find` and the custom Atlas endpoints, and that a
 * disallowed origin yields a 403.
 *
 * `req.user.allowedDomains` is set on the mock user exactly as production
 * provides it — the API-key auth loads the full client doc as `req.user`, and the
 * hook only reads that field (it never re-queries).
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

  // Build a client request carrying the given allowlist + origin/referer headers.
  function clientReq(opts: {
    allowedDomains?: string | null
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
        _status: 'published',
        roles: ['sahaj-atlas-client'],
        allowedDomains: opts.allowedDomains ?? null,
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

  describe('non-empty allowedDomains', () => {
    const allowedDomains = 'allowed.org\n*.wild.org'

    it('rejects with 403 when the Origin host is not in the list', async () => {
      await expect(
        findNarrators(clientReq({ allowedDomains, origin: 'https://evil.org' })),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('allows when the Origin host matches exactly', async () => {
      const result = await findNarrators(
        clientReq({ allowedDomains, origin: 'https://allowed.org' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('allows when only the Referer matches (no Origin header)', async () => {
      const result = await findNarrators(
        clientReq({ allowedDomains, referer: 'https://allowed.org/widget?x=1' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('allows a subdomain via a *. wildcard entry', async () => {
      const result = await findNarrators(
        clientReq({ allowedDomains, origin: 'https://sub.wild.org' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('rejects the apex of a *. wildcard entry with 403', async () => {
      await expect(
        findNarrators(clientReq({ allowedDomains, origin: 'https://wild.org' })),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('allows when no Origin/Referer is present (server-to-server)', async () => {
      const result = await findNarrators(clientReq({ allowedDomains }))
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })
  })

  describe('empty allowedDomains', () => {
    it('allows any origin when the list is null', async () => {
      const result = await findNarrators(
        clientReq({ allowedDomains: null, origin: 'https://anything.example' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })

    it('allows any origin when the list is blank/whitespace', async () => {
      const result = await findNarrators(
        clientReq({ allowedDomains: '   \n  ', origin: 'https://anything.example' }),
      )
      expect(result.docs.map((d) => d.id)).toContain(narratorId)
    })
  })

  describe('custom Atlas endpoints', () => {
    const allowedDomains = 'allowed.org'

    it('geojson: 403 for a disallowed origin', async () => {
      const req = clientReq({ allowedDomains, origin: 'https://evil.org' })
      req.query = { select: { title: true }, depth: 1 }
      const res = (await eventsGeoJson.handler(req)) as Response
      expect(res.status).toBe(403)
    })

    it('geojson: 200 for an allowed origin', async () => {
      const req = clientReq({ allowedDomains, origin: 'https://allowed.org' })
      req.query = { select: { title: true }, depth: 1 }
      const res = (await eventsGeoJson.handler(req)) as Response
      expect(res.status).toBe(200)
    })

    it('register: 403 for a disallowed origin', async () => {
      const req = clientReq({ allowedDomains, origin: 'https://evil.org' })
      req.routeParams = { id: String(eventId) }
      req.json = async () => ({ email: 'reg@evil.org', name: 'Reg' })
      const res = (await registerForEvent.handler(req)) as Response
      expect(res.status).toBe(403)
    })

    it('register: 201 for an allowed origin', async () => {
      const req = clientReq({ allowedDomains, origin: 'https://allowed.org' })
      req.routeParams = { id: String(eventId) }
      // `example.com`, not `allowed.org`: the write-guard's disposable-email list
      // (mailchecker) happens to blacklist allowed.org, and this test is about
      // origins, not email screening.
      req.json = async () => ({ email: 'reg@example.com', name: 'Reg' })
      const res = (await registerForEvent.handler(req)) as Response
      expect(res.status).toBe(201)
    })
  })
})
