import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Clients } from '@/collections/Clients/Clients'
import { clientEmbedReport } from '@/collections/Clients/endpoints/report'
import { runVerifyEmbeds } from '@/jobs/VerifyEmbeds/VerifyEmbeds'
import type { VerificationResult } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Canonical ownership + observed embed metadata on Clients (#633).
 *
 * Three surfaces, one Payload bootstrap: the `validateCanonicalOwnership`
 * beforeChange hook, the `POST /api/clients/report` write path, and the
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
    const findField = (fields: unknown[], name: string): Record<string, unknown> | null => {
      for (const field of fields as Record<string, unknown>[]) {
        if (field.name === name) return field
        const nested = (field.fields ?? field.tabs) as unknown[] | undefined
        const hit = nested && findField(nested, name)
        if (hit) return hit
      }
      return null
    }

    it('declares canonical.embed required and conditional — required only when enabled', () => {
      // `required` + the `enabled` condition is the whole "an embed must be chosen
      // whenever canonical ownership is on" rule.
      const embed = findField(Clients.fields as unknown[], 'embed')
      expect(embed?.required).toBe(true)
      const condition = (embed?.admin as { condition?: (d: unknown) => boolean } | undefined)
        ?.condition
      expect(condition?.({ canonical: { enabled: true } })).toBe(true)
      expect(condition?.({ canonical: { enabled: false } })).toBe(false)
      expect(condition?.({})).toBe(false)
    })

    it('no longer declares legacyConfig, or the three hand-typed canonical fields', () => {
      for (const gone of ['legacyConfig', 'domain', 'mount', 'routing']) {
        expect(findField(Clients.fields as unknown[], gone)).toBeNull()
      }
    })
  })

  // ── validateCanonicalOwnership ────────────────────────────────────────────

  describe('validateCanonicalOwnership', () => {
    it('rejects enabling with neither a region nor an embed, naming both', async () => {
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
      expect(message).toContain('a region and a canonical embed')
    })

    it('rejects enabling without an embed, naming the embed', async () => {
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
      expect(message).toContain('a canonical embed')
      expect(message).not.toContain('a region')
    })

    it('rejects enabling without a region, naming the region', async () => {
      const client = await createClient('No Region')
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { enabled: true, embed: 'https://nirmala.cz/' } },
          overrideAccess: true,
        }),
        'canonical.enabled',
      )
      expect(message).toContain('a region')
      expect(message).not.toContain('canonical embed')
    })

    it('accepts an enabled client with a region and an embed', async () => {
      const client = await createClient('Czechia Owner', { region: czechiaId })
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, embed: 'https://nirmala.cz/lessons' } },
        overrideAccess: true,
      })

      expect(updated.canonical?.enabled).toBe(true)
      expect(updated.canonical?.embed).toBe('https://nirmala.cz/lessons')
      // Nothing is verified yet — the operator nominated a mount, and only the
      // job may fill in what a canonical URL is actually built from.
      expect(updated.canonical?.verification ?? null).toBeNull()
    })

    it('refuses a verification snapshot whose host is not a bare host', async () => {
      // The bare-host rule moved from a field validator into the JSON Schema: the
      // host is job-written now, so the guard belongs at the write it governs.
      const region = await createRegion('latvia')
      const client = await createClient('Bad Verified Host', { region: region.id })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, embed: 'https://bad.example/' } },
        overrideAccess: true,
      })

      await expect(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: {
            canonical: {
              verification: {
                verified: {
                  domain: 'https://example.org/map',
                  mount: '/',
                  routing: 'query',
                  widgetVersion: 2,
                  at: '2026-08-18T00:00:00.000Z',
                },
                failureCount: 0,
                attempts: [],
              },
            },
          } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a second enabled client on an owned region, naming the incumbent', async () => {
      const incumbent = await createClient('Meditace Online', { region: finlandId })
      await payload.update({
        collection: 'clients',
        id: incumbent.id,
        data: { canonical: { enabled: true, embed: 'https://meditoi.fi/' } },
        overrideAccess: true,
      })

      const challenger = await createClient('Jooga', { region: finlandId })
      // The whole point of the rule: "who owns Finland" has to be answerable,
      // and the error has to say who to talk to.
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: challenger.id,
          data: { canonical: { enabled: true, embed: 'https://jooga.org/' } },
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
        data: { canonical: { enabled: true, embed: 'https://meditoi.fi/?p=123' } },
        overrideAccess: true,
      })
      // Self-exclusion — otherwise the incumbent becomes its own conflict and
      // can never be edited again.
      expect(updated.canonical?.embed).toBe('https://meditoi.fi/?p=123')
    })

    it('allows a second DISABLED client on an owned region', async () => {
      const client = await createClient('Finland Runner-up', { region: finlandId })
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: false, embed: 'https://freemeditation.fi/' } },
        overrideAccess: true,
      })
      expect(updated.canonical?.enabled).toBe(false)
      expect(updated.canonical?.embed).toBe('https://freemeditation.fi/')
    })

    it('rejects a region change that would collide with an incumbent', async () => {
      // The hook has to watch `region` too, not just `canonical` — otherwise
      // moving an already-enabled client onto an owned region walks around it.
      const ownRegion = await createRegion('mover-home')
      const client = await createClient('Region Mover', { region: ownRegion.id })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, embed: 'https://mcpraha.org/' } },
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

  // ── The ticket is data-only ───────────────────────────────────────────────

  it('changes no event webUrl', async () => {
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
      data: { canonical: { enabled: true, embed: 'https://example.org/map' } },
      overrideAccess: true,
    })

    const after = await payload.findByID({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
    })
    // Data only: the resolver that consumes these fields is a follow-up ticket.
    expect(after.webUrl).toBe(before.webUrl)
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
          body: { origin: 'https://a.org', pathname: '/x', ...OBSERVATION },
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
          body: { origin: 'https://sahajayoga.nl', pathname: '/x', ...OBSERVATION },
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
          body: { origin: 'https://evil.example', pathname: '/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
      expect(await storedMetadata(client.id)).toBeFalsy()
    })

    it.each([
      ['a query string', '/x?token=secret'],
      ['a fragment', '/x#frag'],
      // The permalink carve-out is exact: anything appended is still seeker data.
      ['a permalink with tracking appended', '/?p=12&utm_source=news'],
    ])('refuses a pathname carrying %s', async (_label, pathname) => {
      const client = await createClient(`Path Reporter ${pathname}`)
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          body: { origin: 'https://sahajayoga.nl', pathname, ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        errors: [{ code: 'query_or_fragment' }],
      })
    })

    it('refuses a body missing required observations', async () => {
      const client = await createClient('Partial Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({ clientId: client.id, body: { origin: 'https://a.org', pathname: '/x', mode: 'iframe' } }),
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
          body: { origin: 'https://sahajayoga.nl', pathname: '/locatelessons', ...OBSERVATION },
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
            origin: 'https://sahajayoga.nl', pathname: '/meditations-kurse-finden',
            ...OBSERVATION,
            mode: 'inline',
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
      expect(stored['https://sahajayoga.nl/meditations-kurse-finden'].mode).toBe('inline')
    })

    it('answers a repeated identical report without writing', async () => {
      const client = await createClient('Repeat Reporter')
      const req = () =>
        reportReq({
          clientId: client.id,
          body: { origin: 'https://a.org', pathname: '/x', ...OBSERVATION },
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
          body: { origin: 'https://a.org', pathname: '/x', ...OBSERVATION },
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

  describe('VerifyEmbeds job', () => {
    const verified: VerificationResult = {
      status: 'verified',
      embed: {
        domain: 'verify.example',
        mount: '/embed',
        routing: 'query',
        widgetVersion: 2,
        at: '2026-08-18T03:00:00.000Z',
      },
    }
    const failed: VerificationResult = { status: 'failed', reason: 'marker-absent' }
    const inconclusive: VerificationResult = { status: 'inconclusive', reason: 'provider-error' }

    /** A service that owns canonical URLs and is due for a check. */
    async function createOwner(name: string, slug: string) {
      const region = await createRegion(slug)
      const client = await createClient(name, { region: region.id })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { enabled: true, embed: 'https://verify.example/embed' } },
        overrideAccess: true,
      })
      return client.id
    }

    const read = async (id: number) =>
      payload.findByID({ collection: 'clients', id, depth: 0, overrideAccess: true })

    /**
     * Run the job with a stubbed verifier — never reaches Cloudflare.
     *
     * `now` has to advance between runs: a failure backs the watermark off geometrically, so a
     * second call at the same instant finds nothing due and would make these assertions vacuous.
     */
    const run = (result: VerificationResult, now: Date) =>
      runVerifyEmbeds({
        payload,
        req: { payload } as never,
        now,
        deps: { verify: async () => result },
      })

    const T0 = new Date('2026-09-01T03:00:00.000Z')
    const daysAfter = (days: number) => new Date(T0.getTime() + days * 86_400_000)

    it('records a verified snapshot and schedules the next check', async () => {
      const id = await createOwner('Verify OK', 'verify-ok')
      const output = await run(verified, T0)

      expect(output.verified).toBeGreaterThanOrEqual(1)
      const doc = await read(id)
      expect(doc.canonical?.verification?.verified).toMatchObject({ domain: 'verify.example' })
      expect(doc.canonical?.nextVerifyAt).toBeTruthy()
      expect(doc.canonical?.enabled).toBe(true)
    })

    it('disables canonical ownership on the third definitive failure, not the second', async () => {
      const id = await createOwner('Verify Failing', 'verify-failing')

      // 1× = +24h, 2× = +48h — each run has to sit past the previous backoff.
      await run(failed, T0)
      await run(failed, daysAfter(2))
      let doc = await read(id)
      expect(doc.canonical?.verification?.failureCount).toBe(2)
      expect(doc.canonical?.enabled).toBe(true)

      await run(failed, daysAfter(6))
      doc = await read(id)
      expect(doc.canonical?.verification?.failureCount).toBe(3)
      expect(doc.canonical?.enabled).toBe(false)
    })

    // The rule the whole design leans on: our integration breaking is not their embed breaking.
    it('changes nothing on an inconclusive run', async () => {
      const id = await createOwner('Verify Inconclusive', 'verify-incon')
      await run(failed, T0)
      const before = await read(id)

      // Past the failure backoff, so this run genuinely examines the service.
      await run(inconclusive, daysAfter(2))
      const after = await read(id)
      expect(after.canonical?.verification?.attempts?.[0]?.status).toBe('inconclusive')

      expect(after.canonical?.verification?.failureCount).toBe(
        before.canonical?.verification?.failureCount,
      )
      expect(after.canonical?.enabled).toBe(true)
    })

    it('ignores services that do not own canonical URLs', async () => {
      await createClient('Not An Owner', { allowedDomains: 'sahajayoga.nl' })
      const output = await run(verified, daysAfter(30))
      // Only the enabled owners above are ever examined.
      expect(output.processed).toBeGreaterThanOrEqual(0)
      const doc = await payload.find({
        collection: 'clients',
        where: { name: { equals: 'Not An Owner' } },
        depth: 0,
        overrideAccess: true,
      })
      expect(doc.docs[0]?.canonical?.verification ?? null).toBeNull()
    })
  })
})
