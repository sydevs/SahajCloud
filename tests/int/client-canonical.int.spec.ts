import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Clients } from '@/collections/Clients/Clients'
import { clientEmbedReport } from '@/collections/Clients/endpoints/report'
import { backfillClientCanonical } from '@/lib/clients/backfillCanonical'
import type { Client } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Canonical ownership + observed embed metadata on Clients (#633).
 *
 * Three surfaces, one Payload bootstrap: the `validateCanonicalOwnership`
 * beforeChange hook, the `POST /api/clients/report` write path, and the
 * `legacyData` → `canonical.*` backfill.
 */
describe('client canonical ownership + embed metadata', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let managerId: number
  let czechiaId: number
  let finlandId: number

  const createRegion = async (slug: string, level: 'country' | 'city' = 'country') =>
    payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name: slug, level, mapboxId: `mb-${slug}`, slug },
    })

  const createClient = async (name: string, overrides: Record<string, unknown> = {}) =>
    testData.createClient(payload, managerId, {
      name,
      roles: ['sahaj-atlas-client'],
      ...overrides,
    })

  /**
   * The per-field message off a rejected write. Payload's ValidationError keeps
   * a generic summary on `.message` and the message a human actually reads on
   * `.data.errors[]` — which is what the admin panel renders under the field.
   */
  const fieldErrorMessage = async (write: Promise<unknown>, path: string): Promise<string> => {
    try {
      await write
      throw new Error(`expected the write to be rejected on "${path}"`)
    } catch (error) {
      const data = (error as { data?: { errors?: Array<{ path: string; message: string }> } }).data
      const match = (data?.errors ?? []).find((entry) => entry.path === path)
      if (!match) throw error
      return match.message
    }
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
    czechiaId = (await createRegion('czechia')).id
    finlandId = (await createRegion('finland')).id
  })

  afterAll(async () => {
    await cleanup()
  })

  // ── Field configuration ───────────────────────────────────────────────────

  describe('field configuration', () => {
    const atlasTab = () => {
      const tabs = Clients.fields.find((field) => field.type === 'tabs')
      if (tabs?.type !== 'tabs') throw new Error('Clients has no tabs field')
      const tab = tabs.tabs.find((candidate) => candidate.label === 'Atlas Config')
      if (!tab) throw new Error('Clients has no Atlas Config tab')
      return tab
    }

    it('offers exactly query and path for canonical.routing', () => {
      const canonical = atlasTab().fields.find(
        (field) => 'name' in field && field.name === 'canonical',
      )
      if (canonical?.type !== 'group') throw new Error('canonical is not a group')
      const routing = canonical.fields.find((field) => 'name' in field && field.name === 'routing')
      if (routing?.type !== 'select') throw new Error('canonical.routing is not a select')

      const values = routing.options.map((option) =>
        typeof option === 'string' ? option : option.value,
      )
      // No `hash`, ever — a canonical URL a crawler can't follow is not a
      // canonical URL, and the widget is dropping hash routing entirely.
      expect(values).toEqual(['query', 'path'])
    })

    it('no longer declares legacyConfig', () => {
      expect(
        atlasTab().fields.some((field) => 'name' in field && field.name === 'legacyConfig'),
      ).toBe(false)
    })
  })

  // ── validateCanonicalOwnership ────────────────────────────────────────────

  describe('validateCanonicalOwnership', () => {
    it('rejects enabling with neither a region nor a domain, naming both', async () => {
      const client = await createClient('No Region No Domain')
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { enabled: true } },
          overrideAccess: true,
        }),
        'canonical.enabled',
      )
      expect(message).toContain('a region and a canonical domain')
    })

    it('rejects enabling without a domain, naming the domain', async () => {
      const client = await createClient('No Domain', { region: czechiaId })
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { enabled: true } },
          overrideAccess: true,
        }),
        'canonical.enabled',
      )
      expect(message).toContain('a canonical domain')
      expect(message).not.toContain('a region')
    })

    it('rejects enabling without a region, naming the region', async () => {
      const client = await createClient('No Region')
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { enabled: true, domain: 'nirmala.cz' } },
          overrideAccess: true,
        }),
        'canonical.enabled',
      )
      expect(message).toContain('a region')
      expect(message).not.toContain('canonical domain')
    })

    it('accepts an enabled client with a region and a domain', async () => {
      const client = await createClient('Czechia Owner', { region: czechiaId })
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, domain: 'nirmala.cz', routing: 'path' } },
        overrideAccess: true,
      })

      expect(updated.canonical?.enabled).toBe(true)
      expect(updated.canonical?.domain).toBe('nirmala.cz')
      expect(updated.canonical?.routing).toBe('path')
      // Not supplied on create, so the field default is what landed.
      expect(updated.canonical?.mount).toBe('/')
    })

    it.each([
      ['a full URL in mount', { mount: 'https://nirmala.cz:8080/lessons' }, 'canonical.mount'],
      ['a scheme in domain', { domain: 'https://nirmala.cz' }, 'canonical.domain'],
    ])('rejects %s', async (_label, patch, path) => {
      // The host is stated once, in `domain`. Pasting a full URL into `mount`
      // would have the resolver join the two into a URL resolving nowhere.
      const client = await createClient(`Mount Shape ${path}`)
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: patch },
          overrideAccess: true,
        }),
        path,
      )
      expect(message).toBeTruthy()
    })

    it('accepts a query-string mount — WordPress default permalinks', async () => {
      const client = await createClient('WP Permalink')
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { mount: '/?p=123' } },
        overrideAccess: true,
      })
      expect(updated.canonical?.mount).toBe('/?p=123')
    })

    it('rejects a second enabled client on an owned region, naming the incumbent', async () => {
      const incumbent = await createClient('Meditace Online', { region: finlandId })
      await payload.update({
        collection: 'clients',
        id: incumbent.id,
        data: { canonical: { enabled: true, domain: 'meditoi.fi' } },
        overrideAccess: true,
      })

      const challenger = await createClient('Jooga', { region: finlandId })
      // The whole point of the rule: "who owns Finland" has to be answerable,
      // and the error has to say who to talk to.
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: challenger.id,
          data: { canonical: { enabled: true, domain: 'jooga.org' } },
          overrideAccess: true,
        }),
        'canonical.enabled',
      )
      expect(message).toContain('Meditace Online')
    })

    it('lets the incumbent re-save itself', async () => {
      const { docs } = await payload.find({
        collection: 'clients',
        where: { name: { equals: 'Meditace Online' } },
        limit: 1,
        overrideAccess: true,
      })
      const updated = await payload.update({
        collection: 'clients',
        id: docs[0].id,
        data: { canonical: { enabled: true, domain: 'meditoi.fi', mount: '/?p=123' } },
        overrideAccess: true,
      })
      // Self-exclusion — otherwise the incumbent becomes its own conflict and
      // can never be edited again.
      expect(updated.canonical?.mount).toBe('/?p=123')
    })

    it('allows a second DISABLED client on an owned region', async () => {
      const client = await createClient('Finland Runner-up', { region: finlandId })
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: false, domain: 'freemeditation.fi' } },
        overrideAccess: true,
      })
      expect(updated.canonical?.enabled).toBe(false)
      expect(updated.canonical?.domain).toBe('freemeditation.fi')
    })

    it('rejects a region change that would collide with an incumbent', async () => {
      // The hook has to watch `region` too, not just `canonical` — otherwise
      // moving an already-enabled client onto an owned region walks around it.
      const ownRegion = await createRegion('mover-home')
      const client = await createClient('Region Mover', { region: ownRegion.id })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, domain: 'mcpraha.org' } },
        overrideAccess: true,
      })

      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { region: finlandId },
          overrideAccess: true,
        }),
        'canonical.enabled',
      )
      expect(message).toContain('Meditace Online')
    })
  })

  // ── What enabling ownership actually does, now the resolver exists ────────

  it('re-roots an event webUrl on the owner’s domain, leaving webPath alone', async () => {
    // Events are scoped to a city/venue region by `filterOptions`.
    const region = await createRegion('weburl-city', 'city')
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title: 'Canonical Guard Event',
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/meet',
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: region.id,
        schedule: {
          firstDate: '2026-01-06T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          recurrenceType: 'DAILY',
          interval: 1,
        },
        _status: 'published',
      }),
    })
    const before = await payload.findByID({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
    })
    expect(before.webUrl).toBeTruthy()

    const owner = await createClient('WebUrl Owner', { region: region.id })
    await payload.update({
      collection: 'clients',
      id: owner.id,
      data: { canonical: { enabled: true, domain: 'example.org', routing: 'path' } },
      overrideAccess: true,
    })

    const after = await payload.findByID({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
    })
    // #633 shipped these fields inert, and this case asserted `webUrl` did not
    // move. #634 is the follow-up that consumes them, so the same scenario now
    // has the opposite expectation: enabling ownership re-roots the canonical.
    expect(before.webUrl).not.toContain('example.org')
    expect(after.webUrl).toBe(`https://example.org${String(after.webPath)}`)
    // …while the path itself — the part every consumer joins to a base — is
    // untouched by ownership.
    expect(after.webPath).toBe(before.webPath)
  })

  // ── POST /api/clients/report ──────────────────────────────────────────────

  describe('POST /api/clients/report', () => {
    const OBSERVATION = {
      mode: 'iframe',
      topLevel: false,
      urlWritable: true,
      paramPersisted: true,
      routing: 'query',
    } as const

    /** A client request carrying headers + a JSON body, as the handler reads them. */
    const reportReq = (opts: {
      clientId: number
      allowedDomains?: string | null
      embedMetadata?: unknown
      origin?: string
      body?: unknown
      status?: string
    }): PayloadRequest => {
      const headers = new Headers()
      if (opts.origin) headers.set('origin', opts.origin)
      return {
        payload,
        headers,
        routeParams: {},
        json: async () => opts.body,
        user: {
          id: opts.clientId,
          collection: 'clients',
          _status: opts.status ?? 'published',
          roles: ['sahaj-atlas-client'],
          allowedDomains: opts.allowedDomains ?? null,
          embedMetadata: opts.embedMetadata,
        },
      } as unknown as PayloadRequest
    }

    const storedMetadata = async (id: number) => {
      const doc = await payload.findByID({
        collection: 'clients',
        id,
        select: { embedMetadata: true },
        overrideAccess: true,
      })
      return doc.embedMetadata
    }

    it('refuses an unpublished client', async () => {
      const client = await createClient('Draft Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          status: 'draft',
          body: { url: 'https://a.org/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
    })

    it('refuses an Origin absent from allowedDomains', async () => {
      const client = await createClient('Origin Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          allowedDomains: 'sahajayoga.nl',
          origin: 'https://evil.example',
          body: { url: 'https://sahajayoga.nl/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
    })

    it('refuses a reported url on a host absent from allowedDomains', async () => {
      // Defence in depth: a report can only ever describe a page on a domain
      // this client owns, whether or not a browser sent an Origin header.
      const client = await createClient('Host Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          allowedDomains: 'sahajayoga.nl',
          origin: 'https://sahajayoga.nl',
          body: { url: 'https://evil.example/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
      expect(await storedMetadata(client.id)).toBeFalsy()
    })

    it.each([
      ['a query string', 'https://sahajayoga.nl/x?token=secret'],
      ['a fragment', 'https://sahajayoga.nl/x#frag'],
    ])('refuses a url carrying %s', async (_label, url) => {
      const client = await createClient(`Path Reporter ${url}`)
      const res = await clientEmbedReport.handler(
        reportReq({ clientId: client.id, body: { url, ...OBSERVATION } }),
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        errors: [{ code: 'query_or_fragment' }],
      })
    })

    it('refuses a body missing required observations', async () => {
      const client = await createClient('Partial Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({ clientId: client.id, body: { url: 'https://a.org/x', mode: 'iframe' } }),
      )
      expect(res.status).toBe(400)
    })

    it('stores two keys for two pages of one site, not one overwrite', async () => {
      const client = await createClient('Two Page Reporter', {
        allowedDomains: 'sahajayoga.nl',
      })

      const first = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          allowedDomains: 'sahajayoga.nl',
          origin: 'https://sahajayoga.nl',
          body: { url: 'https://sahajayoga.nl/locatelessons', ...OBSERVATION },
        }),
      )
      expect(first.status).toBe(200)
      expect(await first.json()).toMatchObject({ ok: true, mounts: 1, updated: true })

      // The second report carries what the first one persisted, exactly as the
      // API-key strategy would hand it back on the next request.
      const afterFirst = await storedMetadata(client.id)
      const second = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          allowedDomains: 'sahajayoga.nl',
          origin: 'https://sahajayoga.nl',
          embedMetadata: afterFirst,
          body: {
            url: 'https://sahajayoga.nl/meditations-kurse-finden',
            ...OBSERVATION,
            mode: 'script',
          },
        }),
      )
      expect(await second.json()).toMatchObject({ ok: true, mounts: 2, updated: true })

      const stored = (await storedMetadata(client.id)) as Record<string, { mode: string }>
      expect(Object.keys(stored).sort()).toEqual([
        'https://sahajayoga.nl/locatelessons',
        'https://sahajayoga.nl/meditations-kurse-finden',
      ])
      expect(stored['https://sahajayoga.nl/locatelessons'].mode).toBe('iframe')
      expect(stored['https://sahajayoga.nl/meditations-kurse-finden'].mode).toBe('script')
    })

    it('answers a repeated identical report without writing', async () => {
      const client = await createClient('Repeat Reporter')
      const req = () =>
        reportReq({
          clientId: client.id,
          body: { url: 'https://a.org/x', ...OBSERVATION },
        })

      await clientEmbedReport.handler(req())
      const stored = await storedMetadata(client.id)
      const before = await payload.findByID({
        collection: 'clients',
        id: client.id,
        overrideAccess: true,
      })

      const repeat = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          embedMetadata: stored,
          body: { url: 'https://a.org/x', ...OBSERVATION },
        }),
      )
      expect(await repeat.json()).toMatchObject({ updated: false })

      // No write at all — this is what keeps a flood of forged reports off the
      // database, so prove it by the row's own updatedAt, not by the response.
      const after = await payload.findByID({
        collection: 'clients',
        id: client.id,
        overrideAccess: true,
      })
      expect(after.updatedAt).toBe(before.updatedAt)
    })

    it('rejects a hand-crafted malformed record at the field schema', async () => {
      // The endpoint is the only writer, but the column's JSON Schema is what
      // guarantees that — without it a bad record just lands.
      const client = await createClient('Schema Reporter')
      // Cast because the generated type already refuses this at compile time —
      // which is half the guarantee. This case asserts the other half: the same
      // schema rejects it at runtime, where a raw REST write has no compiler to
      // stop it.
      const malformed = {
        'https://a.org/x': { mode: 'carrier-pigeon' },
      } as unknown as Client['embedMetadata']

      await expect(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { embedMetadata: malformed },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  // ── Backfill ──────────────────────────────────────────────────────────────

  describe('backfillClientCanonical', () => {
    const legacyData = (config: Record<string, unknown> | null) => ({
      legacyId: 99,
      label: 'Legacy',
      ...(config ? { config } : {}),
    })

    it('seeds domain + routing from legacyData.config and never opts a client in', async () => {
      const client = await createClient('Legacy Seeded', {
        legacyData: legacyData({ domain: 'www.sahajayoga.ca', routing_type: 'path' }),
      })

      await backfillClientCanonical({ payload, apply: true })

      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        overrideAccess: true,
      })
      expect(doc.canonical?.domain).toBe('www.sahajayoga.ca')
      expect(doc.canonical?.routing).toBe('path')
      // The AC, and the reason the script exists at all: the legacy values are
      // unverified, so a human opts in after reading `embedMetadata`.
      expect(doc.canonical?.enabled).toBeFalsy()
    })

    it('leaves a draft client a draft', async () => {
      // A disabled Atlas service imports as a draft precisely so it can't
      // authenticate; seeding it must not publish it.
      const client = await createClient('Legacy Draft', {
        _status: 'draft',
        legacyData: legacyData({ domain: 'dormant.example', routing_type: 'query' }),
      })

      await backfillClientCanonical({ payload, apply: true })

      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        overrideAccess: true,
      })
      expect(doc._status).toBe('draft')
      expect(doc.canonical?.domain).toBe('dormant.example')
    })

    it('does not overwrite a hand-set domain', async () => {
      const client = await createClient('Hand Set', {
        canonical: { domain: 'chosen.example' },
        legacyData: legacyData({ domain: 'legacy.example', routing_type: 'query' }),
      })

      await backfillClientCanonical({ payload, apply: true })

      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        overrideAccess: true,
      })
      expect(doc.canonical?.domain).toBe('chosen.example')
    })

    it('skips a client whose legacy record holds nothing usable', async () => {
      const client = await createClient('No Legacy', { legacyData: legacyData(null) })
      const stats = await backfillClientCanonical({ payload, apply: true })

      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        overrideAccess: true,
      })
      expect(doc.canonical?.domain).toBeFalsy()
      expect(stats.skipped).toBeGreaterThan(0)
    })

    it('is a no-op on a dry run, and idempotent once applied', async () => {
      await createClient('Dry Run Target', {
        legacyData: legacyData({ domain: 'dry.example', routing_type: 'query' }),
      })

      const dry = await backfillClientCanonical({ payload, apply: false })
      expect(dry.changed).toBeGreaterThan(0)

      await backfillClientCanonical({ payload, apply: true })
      const second = await backfillClientCanonical({ payload, apply: true })
      expect(second.changed).toBe(0)
    })
  })
})
