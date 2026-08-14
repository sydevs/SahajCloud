/**
 * Integration tests for client canonical ownership + embed reporting (#633).
 *
 * Two surfaces, one ticket:
 *
 * - `validateCanonicalOwnership` — run through real `payload.update` calls, so
 *   the region/domain requirement and the one-owner-per-region rule are checked
 *   the way the admin panel and the API both hit them.
 * - `POST /api/clients/report` — the handler against real `clients` documents,
 *   so the origin gates run against a real `allowedDomains` and the merge lands
 *   in a real jsonb column (including its JSON Schema validation).
 *
 * The pure merge rule and the report body schema are covered in
 * `tests/unit/client-embed-metadata.spec.ts`; what's proved here is the wiring.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_EMBED_MOUNTS } from '@/collections/Clients/embedMetadata'
import { reportEmbedMetadata } from '@/collections/Clients/endpoints/report'
import type { Client } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const SCHEDULE = {
  firstDate: '2025-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const

const OBSERVATION = {
  mode: 'iframe',
  topLevel: false,
  urlWritable: true,
  paramPersisted: true,
  routing: 'query',
} as const

type ReportBody = {
  ok?: boolean
  mount?: string
  stored?: boolean
  errors?: { message: string }[]
}

describe('client canonical ownership + embed reporting', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let managerId: number
  let czechiaId: number
  let finlandId: number
  let reporterId: number

  const createClient = (name: string, overrides: Record<string, unknown> = {}) =>
    testData.createClient(payload, managerId, {
      name,
      roles: ['sahaj-atlas-client'],
      ...overrides,
    })

  const createRegion = (slug: string, name: string, level: 'country' | 'city' = 'country') =>
    payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name, level, mapboxId: slug, slug },
    })

  /**
   * The per-field messages a rejected write carries.
   *
   * `ValidationError.message` is only Payload's generic "The following field is
   * invalid: …" summary; the message a human actually reads — the one naming the
   * incumbent or the missing half — is on `data.errors`. Asserting the summary
   * would pass for any validation failure at all.
   */
  async function fieldErrors(write: Promise<unknown>): Promise<string> {
    try {
      await write
    } catch (error) {
      const data = (error as { data?: { errors?: { message: string }[] } }).data
      return (data?.errors ?? []).map((e) => e.message).join(' | ')
    }
    throw new Error('expected the write to be rejected, but it succeeded')
  }

  /** Call the report handler as `clientId`, with the given headers + body. */
  async function callReport(
    clientId: number,
    body: unknown,
    headers: Record<string, string> = { origin: 'https://sahajayoga.nl' },
  ): Promise<{ status: number; body: ReportBody }> {
    // `req.user` is the full client doc in production (API-key auth loads it),
    // so re-read it rather than hand-building a partial that could drift.
    const user = await payload.findByID({
      collection: 'clients',
      id: clientId,
      depth: 0,
      overrideAccess: true,
    })

    const req = {
      payload,
      headers: new Headers(headers),
      routeParams: {},
      context: {},
      user: { ...user, collection: 'clients' },
      json: async () => body,
    } as unknown as PayloadRequest

    const response = (await reportEmbedMetadata.handler(req)) as Response
    return { status: response.status, body: await response.json() }
  }

  const storedMetadata = async (clientId: number) => {
    const doc = await payload.findByID({
      collection: 'clients',
      id: clientId,
      depth: 0,
      overrideAccess: true,
    })
    return (doc.embedMetadata ?? {}) as Record<string, { routing: string; lastSeen: string }>
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Canonical Manager',
      email: 'canonical-manager@example.com',
    })
    managerId = manager.id

    czechiaId = (await createRegion('czechia', 'Czechia')).id
    finlandId = (await createRegion('finland', 'Finland')).id

    const reporter = await createClient('Sahaja Yoga Netherlands', {
      allowedDomains: 'sahajayoga.nl\n*.wild.org',
    })
    reporterId = reporter.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('validateCanonicalOwnership', () => {
    it('refuses to enable without a region or a domain, naming both gaps', async () => {
      const client = await createClient('No Target')
      const errors = await fieldErrors(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { enabled: true } },
          overrideAccess: true,
        }),
      )
      expect(errors).toContain('a region and a canonical domain')
    })

    it('names only the missing half when the other is present', async () => {
      const client = await createClient('Region Only', { region: czechiaId })
      const errors = await fieldErrors(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { enabled: true } },
          overrideAccess: true,
        }),
      )
      expect(errors).toContain('needs a canonical domain')
      expect(errors).not.toContain('a region')
    })

    it('accepts an enable that names both', async () => {
      const client = await createClient('Czech Owner', { region: czechiaId })
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, domain: 'nirmala.cz', mount: '/?p=123' } },
        overrideAccess: true,
      })

      expect(updated.canonical?.enabled).toBe(true)
      expect(updated.canonical?.domain).toBe('nirmala.cz')
      // A WordPress default permalink is a legitimate mount — the URL builder
      // joins with `&` in that case rather than `?`.
      expect(updated.canonical?.mount).toBe('/?p=123')
      // Defaulted, and offering exactly two values.
      expect(updated.canonical?.routing).toBe('query')
    })

    it('refuses a second owner on the same region, naming the incumbent', async () => {
      // `Czech Owner` above already owns Czechia. Three published services map
      // to it in the real data, which is why this rule exists at all.
      const rival = await createClient('mcpraha.org', { region: czechiaId })
      const errors = await fieldErrors(
        payload.update({
          collection: 'clients',
          id: rival.id,
          data: { canonical: { enabled: true, domain: 'mcpraha.org' } },
          overrideAccess: true,
        }),
      )
      expect(errors).toMatch(/Czech Owner.*already owns/)
    })

    it('allows a second owner on a different region', async () => {
      const finn = await createClient('Meditoi', { region: finlandId })
      const updated = await payload.update({
        collection: 'clients',
        id: finn.id,
        data: { canonical: { enabled: true, domain: 'www.meditoi.fi', routing: 'path' } },
        overrideAccess: true,
      })
      expect(updated.canonical?.enabled).toBe(true)
      expect(updated.canonical?.routing).toBe('path')
    })

    it('rejects a domain that is not a bare host', async () => {
      const client = await createClient('Bad Domain', { region: finlandId })
      const errors = await fieldErrors(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { domain: 'https://example.org/map' } },
          overrideAccess: true,
        }),
      )
      expect(errors).toContain('bare host')
    })

    it('leaves an unrelated write alone, and costs it no ownership query', async () => {
      // A partial patch materialises an empty `canonical` group; the hook has to
      // read through to the stored value rather than treat that as "disabled",
      // and must not clear what is already there.
      const client = await createClient('Untouched', { region: finlandId })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { domain: 'jooga.org' } },
        overrideAccess: true,
      })

      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { notes: 'unrelated edit' },
        overrideAccess: true,
      })
      expect(updated.canonical?.domain).toBe('jooga.org')
      expect(updated.canonical?.enabled).toBeFalsy()
    })

    it('defaults `enabled` to false on a fresh service', async () => {
      const client = await createClient('Fresh')
      expect(client.canonical?.enabled).toBe(false)
    })
  })

  describe('canonical does not change how anything resolves', () => {
    it('leaves an event webUrl identical after its region gains an owner', async () => {
      const region = await createRegion('netherlands', 'Netherlands', 'city')
      const event = await payload.create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          title: 'Canonical Probe',
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

      const before = await payload.findByID({ collection: 'events', id: event.id, depth: 0 })
      expect(before.webUrl).toBeTruthy()

      const owner = await createClient('Dutch Owner', { region: region.id })
      await payload.update({
        collection: 'clients',
        id: owner.id,
        data: { canonical: { enabled: true, domain: 'sahajayoga.nl', mount: '/locatelessons' } },
        overrideAccess: true,
      })

      const after = await payload.findByID({ collection: 'events', id: event.id, depth: 0 })
      expect(after.webUrl).toBe(before.webUrl)
      expect(after.webPath).toBe(before.webPath)
    })
  })

  describe('POST /api/clients/report', () => {
    it('refuses an unauthenticated caller', async () => {
      const req = {
        payload,
        headers: new Headers(),
        routeParams: {},
        context: {},
        user: null,
        json: async () => ({}),
      } as unknown as PayloadRequest
      const response = (await reportEmbedMetadata.handler(req)) as Response
      expect(response.status).toBe(403)
    })

    it('refuses a request whose Origin header is not in allowedDomains', async () => {
      const { status } = await callReport(
        reporterId,
        { origin: 'https://sahajayoga.nl', pathname: '/locatelessons', ...OBSERVATION },
        { origin: 'https://evil.org' },
      )
      expect(status).toBe(403)
    })

    it('refuses a reported origin that is not in allowedDomains', async () => {
      // The header is browser-vouched; the body is self-reported, so it is the
      // one that could otherwise plant a key for a site this client never served.
      const { status, body } = await callReport(reporterId, {
        origin: 'https://evil.org',
        pathname: '/locatelessons',
        ...OBSERVATION,
      })
      expect(status).toBe(403)
      expect(body.errors?.[0].message).toContain('not allowed')
    })

    it('refuses a client with no allowedDomains configured at all', async () => {
      const unconfigured = await createClient('Unconfigured')
      const { status, body } = await callReport(unconfigured.id, {
        origin: 'https://anywhere.org',
        pathname: '/',
        ...OBSERVATION,
      })
      expect(status).toBe(403)
      expect(body.errors?.[0].message).toContain('no allowed domains')
    })

    it.each(['/locatelessons?event=12', '/locatelessons#top'])(
      'refuses a pathname carrying %s rather than stripping it',
      async (pathname) => {
        const { status } = await callReport(reporterId, {
          origin: 'https://sahajayoga.nl',
          pathname,
          ...OBSERVATION,
        })
        expect(status).toBe(400)
      },
    )

    it('records two pages of one site as two keys, not one overwrite', async () => {
      const site = await createClient('Two Mounts', { allowedDomains: 'sahajayoga.nl' })

      const first = await callReport(site.id, {
        origin: 'https://sahajayoga.nl',
        pathname: '/locatelessons',
        ...OBSERVATION,
      })
      const second = await callReport(site.id, {
        origin: 'https://sahajayoga.nl',
        pathname: '/map',
        ...OBSERVATION,
        mode: 'inline',
        topLevel: true,
      })

      expect(first.status).toBe(200)
      expect(first.body).toMatchObject({ ok: true, stored: true })
      expect(second.body.mount).toBe('https://sahajayoga.nl/map')

      const metadata = await storedMetadata(site.id)
      expect(Object.keys(metadata).sort()).toEqual([
        'https://sahajayoga.nl/locatelessons',
        'https://sahajayoga.nl/map',
      ])
      // Stamped server-side — the widget never supplies it.
      expect(Date.parse(metadata['https://sahajayoga.nl/map'].lastSeen)).not.toBeNaN()
    })

    it('answers 200 without writing when a report repeats unchanged', async () => {
      const site = await createClient('Repeat Reporter', { allowedDomains: 'sahajayoga.nl' })
      const body = {
        origin: 'https://sahajayoga.nl',
        pathname: '/locatelessons',
        ...OBSERVATION,
      }

      await callReport(site.id, body)
      const before = await storedMetadata(site.id)

      const repeat = await callReport(site.id, body)
      expect(repeat.status).toBe(200)
      expect(repeat.body.stored).toBe(false)
      expect(await storedMetadata(site.id)).toEqual(before)
    })

    it('writes immediately when the observation actually changed', async () => {
      const site = await createClient('Changed Reporter', { allowedDomains: 'sahajayoga.nl' })
      const body = {
        origin: 'https://sahajayoga.nl',
        pathname: '/locatelessons',
        ...OBSERVATION,
      }

      await callReport(site.id, body)
      const changed = await callReport(site.id, { ...body, routing: 'path' })

      expect(changed.body.stored).toBe(true)
      const metadata = await storedMetadata(site.id)
      expect(metadata['https://sahajayoga.nl/locatelessons'].routing).toBe('path')
    })

    it('refuses a new mount once the cap is reached', async () => {
      const site = await createClient('Crowded', { allowedDomains: 'sahajayoga.nl' })
      await payload.update({
        collection: 'clients',
        id: site.id,
        data: {
          embedMetadata: Object.fromEntries(
            Array.from({ length: MAX_EMBED_MOUNTS }, (_, i) => [
              `https://sahajayoga.nl/p${i}`,
              { ...OBSERVATION, lastSeen: '2026-01-01T00:00:00.000Z' },
            ]),
          ),
        },
        overrideAccess: true,
      })

      const { status } = await callReport(site.id, {
        origin: 'https://sahajayoga.nl',
        pathname: '/one-too-many',
        ...OBSERVATION,
      })
      expect(status).toBe(429)
    })

    it('rejects a malformed entry at the column, not just at the endpoint', async () => {
      // The field's JSON Schema is the last line of defence: anything writing
      // this column directly still cannot land a shape the readers can't parse.
      // The same schema generates the TS type, so the typed path already refuses
      // `hash` at compile time — the cast is what lets this reach the runtime
      // validator, which is the half an untyped REST caller would hit.
      const site = await createClient('Schema Guard', { allowedDomains: 'sahajayoga.nl' })
      const malformed = {
        'https://sahajayoga.nl/x': { ...OBSERVATION, routing: 'hash', lastSeen: 'now' },
      } as unknown as Client['embedMetadata']

      await expect(
        payload.update({
          collection: 'clients',
          id: site.id,
          data: { embedMetadata: malformed },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })
})
