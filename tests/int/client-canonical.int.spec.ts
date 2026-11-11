import type { FieldAccess, Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Clients } from '@/collections/Clients/Clients'
import { clientEmbedReport } from '@/collections/Clients/endpoints/report'
import { verifyEmbedOnDemand } from '@/collections/Clients/endpoints/verifyEmbed'
import { SKIP_AVAILABLE_LOCALES_CHECK } from '@/fields/availableLocalesField'
import { runVerifyEmbeds } from '@/jobs/VerifyEmbeds/VerifyEmbeds'
import { MAX_EMBED_MOUNTS } from '@/lib/clients/embedMetadata'
import type { RoutingProbeResult, VerificationResult } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Region ownership + observed embed metadata on Clients (#633), on the
 * one-site model: a service has one domain and one primary page (`site`), and
 * owns its region's links when `canonical.owned` is set and its page verified.
 *
 * Surfaces, one Payload bootstrap: the `validateCanonicalOwnership` hook, the
 * `POST /api/clients/report` write path, the VerifyEmbeds job, verify-on-demand
 * and the Install tab's claim.
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

  const createClient = async (label: string, overrides: FixtureOverrides<Client> = {}) =>
    testData.createClient(payload, managerId, {
      label,
      roles: ['sahaj-atlas-client'],
      ...overrides,
    })

  /** Point `sy-atlas-config`'s fallback at a client, or clear it. */
  const setFallbackClient = (clientId: number | null) =>
    payload.updateGlobal({
      slug: 'sy-atlas-config',
      // `availableLocales` is required, and this fresh schema holds none.
      data: { availableLocales: ['en'], canonicalFallbackClient: clientId },
      overrideAccess: true,
      // Nothing is published in this suite's schema, and `availableLocales`
      // refuses an unpublished locale; this is the field's own local-API escape.
      context: { [SKIP_AVAILABLE_LOCALES_CHECK]: true },
    })

  const readClient = (id: number) =>
    payload.findByID({ collection: 'clients', id, depth: 0, overrideAccess: true })

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

    it('stores a page only as a report would spell it', async () => {
      // A page no report can match would leave the claim at unknown-mount for good.
      const client = await createClient('Page Shape', {})
      for (const page of ['/classes?lang=fr', '/classes#map', '/a b']) {
        await expect(
          payload.update({
            collection: 'clients',
            id: client.id,
            data: { site: { domain: 'shape.example', page } },
            overrideAccess: true,
          }),
        ).rejects.toThrow()
      }
      for (const page of ['/classes', '/classes/', '/?p=42']) {
        await payload.update({
          collection: 'clients',
          id: client.id,
          data: { site: { domain: 'shape.example', page } },
          overrideAccess: true,
        })
      }
    })

    it('refuses a listed manager every data field of every conditional tab', async () => {
      // A false condition skips `required` and `validate`, so the write lock is
      // what makes that safe. Both halves come off the config and the rules are
      // called rather than compared, so a fifth tab, a rename, or a field
      // carrying a write rule of its own is covered with no edit here.
      const tabs = (
        Clients.fields.find((field) => field.type === 'tabs') as {
          tabs: {
            name?: string
            label?: unknown
            admin?: { condition?: unknown }
            fields: unknown[]
          }[]
        }
      ).tabs.filter((tab) => tab.admin?.condition)
      expect(tabs.length).toBeGreaterThan(0)

      // A listed manager of a service with no atlas role is hidden every one of
      // these tabs, so every lock in them must refuse this write.
      const req = {
        user: { collection: 'managers', type: 'manager', id: managerId },
      } as unknown as PayloadRequest
      const open: string[] = []
      const walk = async (fields: unknown[], tab: string) => {
        for (const field of fields as Record<string, unknown>[]) {
          if (field.type === 'ui') continue
          if (typeof field.name === 'string') {
            const update = (field.access as { update?: FieldAccess } | undefined)?.update
            const granted = update
              ? await update({ req, data: {}, doc: {}, siblingData: {} } as never)
              : true
            if (granted !== false) open.push(`${tab}.${field.name}`)
          }
          if (Array.isArray(field.fields)) await walk(field.fields, tab)
        }
      }
      for (const tab of tabs) await walk(tab.fields, String(tab.name ?? tab.label))
      expect(open).toEqual([])
    })

    it('serves canonical.embed and allowedDomains computed for the widget, never stored', () => {
      // The widget still selects both; they come from `site` until SahajAtlasWeb
      // reads it directly. `virtual` is the guarantee: no column to drift.
      expect(findField(Clients.fields as unknown[], 'embed')?.virtual).toBe(true)
      expect(findField(Clients.fields as unknown[], 'allowedDomains')?.virtual).toBe(true)
    })

    it('keeps the Install tab’s fields out of the edit form', () => {
      // `admin.disabled` keeps a field out of the form's state, so saving the
      // form can never write back an older copy of what Install saved.
      for (const name of ['site', 'language']) {
        const field = findField(Clients.fields as unknown[], name)
        expect((field?.admin as { disabled?: boolean } | undefined)?.disabled).toBe(true)
      }
    })

    it('no longer declares legacyConfig, or the retired fields', () => {
      for (const gone of ['legacyConfig', 'mount', 'websiteUrl', 'keyGeneratedAt']) {
        expect(findField(Clients.fields as unknown[], gone)).toBeNull()
      }
    })

    it('locks the region and region ownership to admin writes', () => {
      for (const name of ['region', 'owned']) {
        const access = findField(Clients.fields as unknown[], name)?.access as
          { update?: (args: unknown) => boolean } | undefined
        const manager = { req: { user: { collection: 'managers', type: 'manager' } } }
        const admin = { req: { user: { collection: 'managers', type: 'admin' } } }
        expect(access?.update?.(manager)).toBe(false)
        expect(access?.update?.(admin)).toBe(true)
      }
    })

    it('declares canonical.routing derived and untypeable, never an operator setting', () => {
      // `virtual` is the whole guarantee: no stored column, so a write has
      // nowhere to land, whatever the admin panel or a client sends.
      const routing = findField(Clients.fields as unknown[], 'routing')
      expect(routing?.virtual).toBe(true)
      expect((routing?.admin as { readOnly?: boolean } | undefined)?.readOnly).toBe(true)
      expect(routing?.hooks).toBeDefined()
    })

    it('computes both compatibility fields from `site` for a read that selects neither', async () => {
      // The widget's own read selects `canonical` and `allowedDomains`, never
      // `site`, so the hook has to find `site` itself.
      const client = await createClient('Compat Reader', {
        site: { domain: 'compat.example', page: '/classes' },
      })
      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        depth: 0,
        select: { canonical: true, allowedDomains: true },
        overrideAccess: true,
      })
      expect(doc.canonical?.embed).toBe('https://compat.example/classes')
      expect(doc.allowedDomains).toBe('compat.example')
    })
  })

  // ── validateCanonicalOwnership ────────────────────────────────────────────

  describe('validateCanonicalOwnership', () => {
    it('releases a reactivated owner whose region another site took meanwhile', async () => {
      const region = await createRegion('reactivate-taken')
      const first = await createClient('Reactivated Owner', {
        region: region.id,
        canonical: { owned: true },
      })
      await payload.update({
        collection: 'clients',
        id: first.id,
        data: { enabled: false },
        overrideAccess: true,
      })
      await createClient('Took Over', { region: region.id, canonical: { owned: true } })

      const back = await payload.update({
        collection: 'clients',
        id: first.id,
        data: { enabled: true },
        overrideAccess: true,
      })
      expect(back.enabled).toBe(true)
      expect(back.canonical?.owned).toBe(false)
    })

    it('does not count an inactive owner as the incumbent', async () => {
      // It owns nothing by the read rule, and nothing else would ever clear it.
      const region = await createRegion('inactive-incumbent')
      await createClient('Inactive Incumbent', {
        region: region.id,
        enabled: false,
        canonical: { owned: true },
      })
      const challenger = await createClient('Active Challenger', { region: region.id })
      const updated = await payload.update({
        collection: 'clients',
        id: challenger.id,
        data: { canonical: { owned: true } },
        overrideAccess: true,
      })
      expect(updated.canonical?.owned).toBe(true)
    })

    it('refuses ownership to a worldwide service, naming why', async () => {
      const client = await createClient('Worldwide Owner')
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { owned: true } },
          overrideAccess: true,
        }),
        'canonical.owned',
      )
      expect(message).toContain('worldwide service owns no region')
    })

    it('lets the sy-atlas-config fallback own with no region of its own', async () => {
      const client = await createClient('Fallback Owner')
      await setFallbackClient(client.id)
      try {
        const updated = await payload.update({
          collection: 'clients',
          id: client.id,
          data: { canonical: { owned: true } },
          overrideAccess: true,
        })
        expect(updated.canonical?.owned).toBe(true)
      } finally {
        await setFallbackClient(null)
      }
    })

    it('accepts an owner with a region, and verifies nothing for it', async () => {
      const client = await createClient('Czechia Owner', {
        region: czechiaId,
        site: { domain: 'nirmala.cz', page: '/lessons' },
      })
      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { owned: true } },
        overrideAccess: true,
      })

      expect(updated.canonical?.owned).toBe(true)
      // Only the job may fill in what a canonical URL is actually built from.
      expect(updated.canonical?.verification ?? null).toBeNull()
    })

    it('refuses a verification snapshot whose host is not a bare host', async () => {
      // The bare-host rule lives in the JSON Schema: the host is job-written,
      // so the guard belongs at the write it governs.
      const region = await createRegion('latvia')
      const client = await createClient('Bad Verified Host', { region: region.id })

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

    it('rejects a second owner on an owned region, naming the incumbent', async () => {
      await createClient('Meditace Online', { region: finlandId, canonical: { owned: true } })

      const challenger = await createClient('Jooga', { region: finlandId })
      // "Who owns Finland" has to be answerable, and the error has to say who
      // to talk to.
      const message = await fieldErrorMessage(
        payload.update({
          collection: 'clients',
          id: challenger.id,
          data: { canonical: { owned: true } },
          overrideAccess: true,
        }),
        'canonical.owned',
      )
      expect(message).toContain('Meditace Online')
    })

    it('lets the incumbent release and re-take its own region', async () => {
      // Self-exclusion — otherwise the incumbent becomes its own conflict.
      const { docs } = await payload.find({
        collection: 'clients',
        where: { label: { equals: 'Meditace Online' } },
        limit: 1,
        overrideAccess: true,
      })
      const id = docs[0].id
      await payload.update({
        collection: 'clients',
        id,
        data: { canonical: { owned: false } },
        overrideAccess: true,
      })
      const updated = await payload.update({
        collection: 'clients',
        id,
        data: { canonical: { owned: true } },
        overrideAccess: true,
      })
      expect(updated.canonical?.owned).toBe(true)
    })

    it('allows a second service on an owned region that does not own it', async () => {
      const client = await createClient('Finland Runner-up', {
        region: finlandId,
        site: { domain: 'freemeditation.fi', page: '/' },
      })
      expect(client.canonical?.owned ?? false).toBe(false)
    })

    it('releases ownership when an admin moves a service to another region', async () => {
      // Ownership does not follow a region change, even onto a free region:
      // the old region's links must not silently move with the service.
      const home = await createRegion('mover-home')
      const away = await createRegion('mover-away')
      const client = await createClient('Region Mover', {
        region: home.id,
        canonical: { owned: true },
      })

      const moved = await payload.update({
        collection: 'clients',
        id: client.id,
        data: { region: away.id },
        overrideAccess: true,
      })
      expect(moved.canonical?.owned).toBe(false)

      // And onto an owned region it is a release, not a collision.
      const ontoOwned = await createClient('Region Mover Two', {
        region: home.id,
        canonical: { owned: true },
      })
      const collided = await payload.update({
        collection: 'clients',
        id: ontoOwned.id,
        data: { region: finlandId },
        overrideAccess: true,
      })
      expect(collided.canonical?.owned).toBe(false)
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

    const owner = await createClient('WebUrl Owner', {
      region: region.id,
      site: { domain: 'example.org', page: '/' },
      canonical: { owned: true },
    })

    const ownedOnly = await payload.findByID({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
    })
    // Owning is a claim, not an attestation: until the CMS has loaded the page
    // itself, this client publishes nothing and the canonical must not move.
    expect(ownedOnly.webUrl).toBe(before.webUrl)

    await payload.update({
      collection: 'clients',
      id: owner.id,
      data: {
        canonical: {
          verification: {
            verified: {
              domain: 'example.org',
              mount: '/',
              widgetVersion: 2,
              at: '2026-08-18T00:00:00.000Z',
            },
            failureCount: 0,
            attempts: [],
            // The URL *shape* comes from the probe's verdict, not from the
            // widget's self-report beside it (#644).
            routingProbe: { at: '2026-08-18T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
          },
        },
      } as never,
      overrideAccess: true,
    })

    const after = await payload.findByID({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
    })
    // #633 shipped these fields inert, and this case asserted `webUrl` did not
    // move. #634 is the follow-up that consumes them, so the same scenario now
    // has the opposite expectation: a *verified* owner re-roots the canonical.
    expect(before.webUrl).not.toContain('example.org')
    expect(after.webUrl).toBe(`https://example.org${String(after.webPath)}`)
    // …while the path itself — the part every consumer joins to a base — is
    // untouched by ownership.
    expect(after.webPath).toBe(before.webPath)

    // An inactive service owns nothing, verified or not: the one rule of
    // ownership applies to every reader (`CANONICAL_ELIGIBLE`).
    await payload.update({
      collection: 'clients',
      id: owner.id,
      data: { enabled: false },
      overrideAccess: true,
    })
    const inactive = await payload.findByID({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
    })
    expect(inactive.webUrl).toBe(before.webUrl)
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
      /** The service's one domain; `null` for a service with none yet. */
      domain?: string | null
      page?: string | null
      embedMetadata?: unknown
      origin?: string
      body?: unknown
      enabled?: boolean
    }): PayloadRequest => {
      const headers = new Headers()
      if (opts.origin) headers.set('origin', opts.origin)
      return {
        payload,
        headers,
        routeParams: {},
        json: async () => opts.body,
        // The whole client doc, as `APIKeyAuthentication` hands it over — it
        // finds the row with no `select`, so every field the handler reads off
        // `req.user` is present. `site` is one of them (the host check), and a
        // fixture that omitted it would report a pass for a check that never ran.
        user: {
          id: opts.clientId,
          collection: 'clients',
          enabled: opts.enabled ?? true,
          roles: ['sahaj-atlas-client'],
          site: {
            domain: opts.domain === undefined ? 'sahajayoga.nl' : opts.domain,
            page: opts.page ?? null,
          },
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

    it('refuses an inactive client', async () => {
      const client = await createClient('Inactive Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          enabled: false,
          body: { origin: 'https://sahajayoga.nl', pathname: '/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
    })

    it('refuses an Origin that is not the service’s domain', async () => {
      const client = await createClient('Origin Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          origin: 'https://evil.example',
          body: { origin: 'https://sahajayoga.nl', pathname: '/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
    })

    it('refuses a reported url on another host', async () => {
      // Defence in depth: a report can only ever describe a page on this
      // service's own site, whether or not a browser sent an Origin header.
      const client = await createClient('Host Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          origin: 'https://sahajayoga.nl',
          body: { origin: 'https://evil.example', pathname: '/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
      expect(await storedMetadata(client.id)).toBeFalsy()
    })

    it('refuses every report from a service with no domain yet', async () => {
      // With no domain there is no site to describe, so a key holder cannot
      // fill an unconfigured service's reports with pages of their choosing.
      const client = await createClient('Domainless Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          domain: null,
          body: { origin: 'https://attacker.example', pathname: '/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(403)
      expect(await storedMetadata(client.id)).toBeFalsy()
    })

    it('accepts a report from the www twin of the service’s domain', async () => {
      const client = await createClient('Twin Reporter')
      const res = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          origin: 'https://www.sahajayoga.nl',
          body: { origin: 'https://www.sahajayoga.nl', pathname: '/x', ...OBSERVATION },
        }),
      )
      expect(res.status).toBe(200)
      expect(Object.keys((await storedMetadata(client.id)) ?? {})).toEqual([
        'https://www.sahajayoga.nl/x',
      ])
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
        reportReq({
          clientId: client.id,
          body: { origin: 'https://a.org', pathname: '/x', mode: 'iframe' },
        }),
      )
      expect(res.status).toBe(400)
    })

    it('stores two keys for two pages of one site, not one overwrite', async () => {
      const client = await createClient('Two Page Reporter', {
        site: { domain: 'sahajayoga.nl' },
      })

      const first = await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
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
          origin: 'https://sahajayoga.nl',
          embedMetadata: afterFirst,
          body: {
            origin: 'https://sahajayoga.nl',
            pathname: '/meditations-kurse-finden',
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

    it('keeps a reported mount through a later save of the service', async () => {
      // While `clients` had drafts, Payload built every update on the latest
      // *version* row, so a mount written to the row alone was dropped by the
      // next save — the claim and the verification included. The collection
      // keeps no versions now, so the row is the record.
      const client = await createClient('Saved Reporter', { site: { domain: 'a.org' } })
      await clientEmbedReport.handler(
        reportReq({
          clientId: client.id,
          domain: 'a.org',
          body: { origin: 'https://a.org', pathname: '/x', ...OBSERVATION },
        }),
      )

      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { notes: 'Saved after a report' },
        overrideAccess: true,
      })

      expect(Object.keys((await storedMetadata(client.id)) ?? {})).toEqual(['https://a.org/x'])
    })

    it('answers a repeated identical report without writing', async () => {
      const client = await createClient('Repeat Reporter')
      const req = () =>
        reportReq({
          clientId: client.id,
          domain: 'a.org',
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
          domain: 'a.org',
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

    // ── The mount cap (#639) ────────────────────────────────────────────────

    describe('mount cap', () => {
      /** `count` well-formed mounts, `p0` oldest, one second apart. */
      const fillMounts = (count: number) =>
        Object.fromEntries(
          Array.from({ length: count }, (_, i) => [
            `https://sahajayoga.nl/p${i}`,
            { ...OBSERVATION, lastSeen: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() },
          ]),
        ) as Client['embedMetadata']

      /**
       * A client whose row really holds a full record. Seeding the row matters:
       * the handler writes with raw SQL against it, so a fixture that only
       * populated `req.user` would exercise the merge and never the write.
       */
      const seedAtCap = async (name: string) => {
        const client = await createClient(name, { site: { domain: 'sahajayoga.nl' } })
        await payload.update({
          collection: 'clients',
          id: client.id,
          data: { embedMetadata: fillMounts(MAX_EMBED_MOUNTS) },
          overrideAccess: true,
        })
        return client
      }

      const report = async (clientId: number, pathname: string) => {
        // Re-read the whole row, the way the API-key strategy would on the next
        // request — the cap reads `site` as well as `embedMetadata`.
        const doc = await payload.findByID({
          collection: 'clients',
          id: clientId,
          overrideAccess: true,
        })
        return clientEmbedReport.handler(
          reportReq({
            clientId,
            origin: 'https://sahajayoga.nl',
            embedMetadata: doc.embedMetadata,
            page: doc.site?.page,
            body: { origin: 'https://sahajayoga.nl', pathname, ...OBSERVATION },
          }),
        )
      }

      it('accepts a new mount at the cap and drops the evicted one from the column', async () => {
        const client = await seedAtCap('Capped Reporter')

        const res = await report(client.id, '/newly-added')
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({
          ok: true,
          mounts: MAX_EMBED_MOUNTS,
          updated: true,
        })

        // `jsonb ||` cannot delete, so a write that only merged the post-eviction
        // record would leave `p0` behind — the cap would compute an eviction,
        // log it, and never apply it.
        const stored = (await storedMetadata(client.id)) as Record<string, unknown>
        expect(Object.keys(stored)).toHaveLength(MAX_EMBED_MOUNTS)
        expect(stored['https://sahajayoga.nl/newly-added']).toBeDefined()
        expect(stored['https://sahajayoga.nl/p0']).toBeUndefined()
      })

      it('stays bounded across repeated reports past the cap', async () => {
        // The failure this guards is cumulative: a merge that cannot delete grows
        // the record by one on every report, so one round looks nearly right.
        const client = await seedAtCap('Repeatedly Capped Reporter')

        for (const pathname of ['/one', '/two', '/three']) {
          expect((await report(client.id, pathname)).status).toBe(200)
        }

        const stored = (await storedMetadata(client.id)) as Record<string, unknown>
        expect(Object.keys(stored)).toHaveLength(MAX_EMBED_MOUNTS)
        expect(stored['https://sahajayoga.nl/three']).toBeDefined()
      })
    })
  })

  // ── Backfill ──────────────────────────────────────────────────────────────

  describe('VerifyEmbeds job', () => {
    const verified: VerificationResult = {
      status: 'verified',
      embed: {
        domain: 'verify.example',
        mount: '/embed',
        widgetVersion: 2,
        at: '2026-08-18T03:00:00.000Z',
      },
    }
    const failed: VerificationResult = { status: 'failed', reason: 'marker-absent' }
    const inconclusive: VerificationResult = { status: 'inconclusive', reason: 'provider-error' }

    /** The `site` group a primary-page URL names. */
    const siteOf = (page: string) => {
      const url = new URL(page)
      return { domain: url.hostname, page: `${url.pathname}${url.search}` }
    }

    /** A service that owns its region, with a primary page, due for a check. */
    async function createOwner(name: string, slug: string, page = 'https://verify.example/embed') {
      const region = await createRegion(slug)
      const client = await createClient(name, {
        region: region.id,
        site: siteOf(page),
        canonical: { owned: true },
      })
      return client.id
    }

    const read = readClient

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
      expect(doc.canonical?.owned).toBe(true)
    })

    it('releases region ownership on the third definitive failure, not the second', async () => {
      const id = await createOwner('Verify Failing', 'verify-failing')

      // 1× = +24h, 2× = +48h — each run has to sit past the previous backoff.
      await run(failed, T0)
      await run(failed, daysAfter(2))
      let doc = await read(id)
      expect(doc.canonical?.verification?.failureCount).toBe(2)
      expect(doc.canonical?.owned).toBe(true)
      expect(doc.canonical?.verification?.releasedAt).toBeUndefined()

      const output = await run(failed, daysAfter(6))
      doc = await read(id)
      expect(doc.canonical?.verification?.failureCount).toBe(3)
      expect(doc.canonical?.owned).toBe(false)
      // Recorded, so the open-items row can say the region went (#1055).
      expect(doc.canonical?.verification?.releasedAt).toBe(daysAfter(6).toISOString())
      // The service itself stays on: losing the region is not losing the key.
      expect(doc.enabled).toBe(true)
      expect(output.disabled).toBeGreaterThanOrEqual(1)
    })

    it('gives a recovered site its region back, unless another site took it', async () => {
      const failUntilReleased = async (id: number) => {
        await run(failed, daysAfter(200))
        await run(failed, daysAfter(202))
        await run(failed, daysAfter(206))
        expect((await read(id)).canonical?.verification?.releasedAt).toBeTruthy()
      }

      const recovers = await createOwner('Recovers', 'verify-recovers')
      await failUntilReleased(recovers)
      await run(verified, daysAfter(220))
      let doc = await read(recovers)
      expect(doc.canonical?.owned).toBe(true)
      expect(doc.canonical?.verification?.releasedAt).toBeUndefined()

      const loses = await createOwner('Loses', 'verify-loses')
      await run(failed, daysAfter(300))
      await run(failed, daysAfter(302))
      await run(failed, daysAfter(306))
      const { region } = await read(loses)
      await createClient('Took It', { region: region as number, canonical: { owned: true } })
      await run(verified, daysAfter(320))
      doc = await read(loses)
      expect(doc.canonical?.owned).toBe(false)
      expect(doc.canonical?.verification?.failureCount).toBe(0)
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
      expect(after.canonical?.owned).toBe(true)
    })

    it('checks a service with a page whether or not it owns its region', async () => {
      // A page that is not running the atlas is worth knowing about whatever
      // it owns, so every active service with a page is examined.
      const client = await createClient('Not An Owner', {
        site: siteOf('https://notowner.example/'),
      })
      await run(verified, daysAfter(30))
      expect((await read(client.id)).canonical?.verification?.verified).toMatchObject({
        domain: 'verify.example',
      })
    })

    it('releases and reports nothing for a non-owner, however often its page fails', async () => {
      const client = await createClient('Failing Non-Owner', {
        site: siteOf('https://failing-nonowner.example/'),
      })
      // Only this page fails, so any release the run reports would be this one.
      const runOnlyThisFailing = (now: Date) =>
        runVerifyEmbeds({
          payload,
          req: { payload } as never,
          now,
          deps: {
            verify: async (mount: string) =>
              mount.includes('failing-nonowner') ? failed : verified,
          },
        })
      await runOnlyThisFailing(daysAfter(100))
      await runOnlyThisFailing(daysAfter(102))
      const third = await runOnlyThisFailing(daysAfter(106))
      const doc = await read(client.id)
      expect(doc.canonical?.verification?.failureCount).toBe(3)
      expect(doc.canonical?.owned ?? false).toBe(false)
      // A third strike on a page that owns nothing releases nothing.
      expect(third.disabled).toBe(0)
      expect(doc.canonical?.verification?.releasedAt).toBeUndefined()
    })

    it('skips a service with no page, and an inactive one', async () => {
      const pageless = await createClient('Pageless', { site: { domain: 'pageless.example' } })
      const inactive = await createClient('Inactive With Page', {
        enabled: false,
        site: siteOf('https://inactive.example/classes'),
      })
      await run(verified, daysAfter(200))
      expect((await read(pageless.id)).canonical?.verification ?? null).toBeNull()
      expect((await read(inactive.id)).canonical?.verification ?? null).toBeNull()
    })

    // ── The routing probe (#644) ───────────────────────────────────────

    /**
     * The job with both renders stubbed, recording every mount the probe was
     * asked about — the probe budget is part of the contract, so "was it called
     * at all" has to be observable.
     */
    const runProbing = async (args: {
      mount: VerificationResult
      probe: RoutingProbeResult
      now: Date
    }) => {
      const probed: string[] = []
      const output = await runVerifyEmbeds({
        payload,
        req: { payload } as never,
        now: args.now,
        deps: {
          verify: async () => args.mount,
          probe: async (mountKey: string) => {
            probed.push(mountKey)
            return args.probe
          },
        },
      })
      return { output, probed }
    }

    const PROBE_MOUNT = 'https://probe.example/classes'
    const positive: RoutingProbeResult = { status: 'positive' }
    const negative: RoutingProbeResult = { status: 'negative' }

    it('promotes a service to path routing on a single positive probe', async () => {
      const id = await createOwner('Probe Promote', 'probe-promote', PROBE_MOUNT)
      const { output, probed } = await runProbing({
        mount: verified,
        probe: positive,
        now: daysAfter(40),
      })

      expect(probed).toContain(PROBE_MOUNT)
      expect(output.pathPromoted).toBeGreaterThanOrEqual(1)
      const doc = await read(id)
      expect(doc.canonical?.verification?.routingProbe).toMatchObject({
        verdict: 'path',
        failedAttempts: 0,
      })
      expect(doc.canonical?.routing).toBe('path')
    })

    /**
     * The asymmetry that matters: a wrong `path` 404s every deep link, a wrong
     * `query` only produces uglier URLs that work. So promotion is immediate and
     * demotion needs a pattern — and neither may touch `failureCount`, which is
     * what switches canonical ownership off and emails a manager.
     */
    it('demotes only on the third consecutive negative, and never disables ownership', async () => {
      const id = await createOwner('Probe Demote', 'probe-demote', PROBE_MOUNT)
      await runProbing({ mount: verified, probe: positive, now: daysAfter(50) })
      expect((await read(id)).canonical?.routing).toBe('path')

      await runProbing({ mount: verified, probe: negative, now: daysAfter(51) })
      await runProbing({ mount: verified, probe: negative, now: daysAfter(52) })
      let doc = await read(id)
      expect(doc.canonical?.routing).toBe('path')
      expect(doc.canonical?.verification?.routingProbe?.failedAttempts).toBe(2)

      await runProbing({ mount: verified, probe: negative, now: daysAfter(53) })
      doc = await read(id)
      expect(doc.canonical?.routing).toBe('query')
      // The embed is present and publishing — in `?atlas=` shape, which is a
      // real canonical. Nothing about ownership may have moved.
      expect(doc.canonical?.owned).toBe(true)
      expect(doc.canonical?.verification?.failureCount).toBe(0)
      expect(doc.canonical?.verification?.verified).toMatchObject({ domain: 'verify.example' })
    })

    it('counts a negative without spending a render when the mount itself failed', async () => {
      const id = await createOwner('Probe Mount Failed', 'probe-mount-failed', PROBE_MOUNT)
      const { probed } = await runProbing({ mount: failed, probe: positive, now: daysAfter(60) })

      // The widget is not on the page at all, so the subtree cannot be serving it.
      expect(probed).not.toContain(PROBE_MOUNT)
      const doc = await read(id)
      expect(doc.canonical?.verification?.routingProbe).toMatchObject({
        verdict: 'query',
        failedAttempts: 1,
      })
    })

    it('leaves the verdict and the strike count alone on an inconclusive run', async () => {
      const id = await createOwner('Probe Inconclusive', 'probe-inconclusive', PROBE_MOUNT)
      await runProbing({ mount: verified, probe: positive, now: daysAfter(70) })
      const before = (await read(id)).canonical?.verification?.routingProbe

      const { probed } = await runProbing({
        mount: inconclusive,
        probe: negative,
        now: daysAfter(71),
      })
      expect(probed).not.toContain(PROBE_MOUNT)
      expect((await read(id)).canonical?.verification?.routingProbe).toEqual(before)
    })

    /**
     * The reason the verdict is a sibling of `verified` rather than a key inside
     * it: the widget should path-route as soon as the host serves the subtree,
     * whether or not the mount verification has ever succeeded.
     */
    it('reports path for a service whose mount verification has never succeeded', async () => {
      const id = await createOwner('Probe Unverified', 'probe-unverified', PROBE_MOUNT)
      await payload.update({
        collection: 'clients',
        id,
        data: {
          canonical: {
            verification: {
              verified: null,
              failureCount: 0,
              attempts: [],
              routingProbe: { at: '2026-09-12T03:00:00.000Z', verdict: 'path', failedAttempts: 0 },
            },
          },
        },
        overrideAccess: true,
      })

      const doc = await read(id)
      expect(doc.canonical?.verification?.verified ?? null).toBeNull()
      expect(doc.canonical?.routing).toBe('path')
    })

    // The column is closed (`additionalProperties: false`) and validated on
    // every save of the document, so a required `routingProbe` would have stranded
    // every row written before this shipped.
    it('still saves a service whose verification predates the probe', async () => {
      const id = await createOwner('Probe Legacy Row', 'probe-legacy', PROBE_MOUNT)
      await payload.update({
        collection: 'clients',
        id,
        data: {
          canonical: {
            verification: {
              verified: {
                domain: 'probe.example',
                mount: '/classes',
                widgetVersion: 2,
                at: '2026-08-01T00:00:00.000Z',
              },
              failureCount: 0,
              attempts: [],
            },
          },
        },
        overrideAccess: true,
      })

      // With no probe, the routing is the read path's default.
      const doc = await read(id)
      expect(doc.canonical?.routing).toBe('query')

      // And it saves again untouched, which is what a closed column makes fragile.
      await expect(
        payload.update({
          collection: 'clients',
          id,
          data: { notes: 'unrelated edit' },
          overrideAccess: true,
        }),
      ).resolves.toBeTruthy()
    })
  })

  // ── POST /api/clients/:id/verify-embed ──────────────────────────────────────

  describe('verify-embed on demand', () => {
    /**
     * Exercised without Cloudflare credentials, so both renders come back
     * `unconfigured` — the case an operator on a fresh environment actually
     * hits. What is under test is the wiring: the handler folds a probe result
     * in, persists the row, and answers with the derived routing.
     */
    it('answers with the derived routing, and changes nothing it could not observe', async () => {
      const region = await createRegion('verify-on-demand')
      const client = await createClient('Verify On Demand', {
        region: region.id,
        site: { domain: 'ondemand.example', page: '/classes' },
        canonical: { owned: true },
      })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          canonical: {
            verification: {
              verified: null,
              failureCount: 0,
              attempts: [],
              routingProbe: { at: '2026-09-12T03:00:00.000Z', verdict: 'path', failedAttempts: 0 },
            },
          },
        },
        overrideAccess: true,
      })

      const req = {
        payload,
        routeParams: { id: String(client.id) },
        user: { id: managerId, collection: 'managers', type: 'admin' },
      } as unknown as PayloadRequest
      const response = await (
        verifyEmbedOnDemand.handler as (r: PayloadRequest) => Promise<Response>
      )(req)
      expect(response.status).toBe(200)

      const body = (await response.json()) as { status: string; routing: string }
      expect(body.status).toBe('inconclusive')
      expect(body.routing).toBe('path')

      // An inconclusive check must leave the stored verdict exactly as it was.
      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(doc.canonical?.verification?.routingProbe).toMatchObject({
        verdict: 'path',
        failedAttempts: 0,
      })
    })

    /**
     * The case that was broken, and that nothing covered.
     *
     * The SEO checks resolve as the client being checked, and the audit request
     * used to be a spread of the caller's — headers included. So
     * `assertClientOriginAllowed` saw a `clients` user carrying the **admin
     * panel's** `Origin`, found it outside the client's domain, and threw 403
     * from inside the forwarded reads. Nothing caught it, so the verification
     * result computed above was discarded and the row never written. Every
     * correctly configured client has a domain, so this was the normal path;
     * the nightly job sends no headers and never saw it.
     *
     * `verified` is seeded because an inconclusive run keeps the last good
     * snapshot, which is what makes the checks run at all here.
     */
    it('persists the run for a client with a domain set', async () => {
      const region = await createRegion('verify-origin-gate')
      const client = await createClient('Verify Origin Gate', {
        region: region.id,
        site: { domain: 'ondemand.example', page: '/classes' },
        canonical: { owned: true },
      })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          canonical: {
            verification: {
              verified: {
                domain: 'ondemand.example',
                mount: '/classes',
                widgetVersion: 3,
                at: '2026-10-01T00:00:00.000Z',
              },
              failureCount: 0,
              attempts: [],
            },
          },
        },
        overrideAccess: true,
      })

      const req = {
        payload,
        routeParams: { id: String(client.id) },
        // A manager's press, so the request carries what a browser sends.
        headers: new Headers({
          origin: 'https://cms.example',
          referer: 'https://cms.example/admin',
        }),
        user: { id: managerId, collection: 'managers', type: 'admin' },
      } as unknown as PayloadRequest
      const response = await (
        verifyEmbedOnDemand.handler as (r: PayloadRequest) => Promise<Response>
      )(req)

      expect(response.status).toBe(200)
      const body = (await response.json()) as { status: string; seo?: unknown[] }
      expect(body.status).toBe('inconclusive')

      // The write survived, which is the whole assertion: a 403 escaping the
      // audit used to take it with it.
      const doc = await payload.findByID({
        collection: 'clients',
        id: client.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(doc.canonical?.nextVerifyAt).toBeTruthy()
      expect(doc.canonical?.verification?.verified?.domain).toBe('ondemand.example')
    }, 60_000)

    it('answers 400 for a service with no atlas address yet', async () => {
      const client = await createClient('Verify Addressless')
      const response = await (
        verifyEmbedOnDemand.handler as (r: PayloadRequest) => Promise<Response>
      )({
        payload,
        routeParams: { id: String(client.id) },
        user: { id: managerId, collection: 'managers', type: 'admin' },
      } as unknown as PayloadRequest)
      expect(response.status).toBe(400)
    })

    it('refuses a manager who does not manage the service', async () => {
      // `requireActiveManager` admits any manager whose type is not inactive,
      // so the row's own read access is the whole gate — and this endpoint
      // spends outbound fetches, mails the service's contact, and can demote
      // its routing verdict.
      const other = await testData.createManager(payload, {
        name: 'Verify Stranger',
        email: 'verify-stranger@example.com',
      })
      const region = await createRegion('verify-stranger')
      const client = await createClient('Verify Stranger Client', { region: region.id })

      const req = {
        payload,
        routeParams: { id: String(client.id) },
        user: { id: other.id, collection: 'managers', type: 'manager' },
      } as unknown as PayloadRequest
      const response = await (
        verifyEmbedOnDemand.handler as (r: PayloadRequest) => Promise<Response>
      )(req)
      expect(response.status).toBe(404)
    })
  })

  /**
   * The region claim `verify-embed` makes before it verifies (#1055) — so the
   * common case, the first site in its region, needs no decision from anyone.
   *
   * Every case here is about a refusal, because the success path is one line and
   * the refusals are what a volunteer actually meets. The uniqueness rule in
   * particular is **not** re-implemented in the endpoint, so these assert that
   * the hook's own refusal reaches the caller rather than that a second copy of
   * it agrees. Run without Cloudflare credentials, so the verification half is
   * `inconclusive` and changes nothing.
   */
  describe('the region claim', () => {
    const DOMAIN = 'claimed.example'
    const PAGE = '/classes'
    const MOUNT = `https://${DOMAIN}${PAGE}`

    /** The claim half of a check's answer. */
    const callClaim = async (
      clientId: number,
      user: Record<string, unknown> = { id: managerId, collection: 'managers', type: 'admin' },
    ): Promise<{ status: number; body: { status?: string; message?: string } }> => {
      const req = {
        payload,
        routeParams: { id: String(clientId) },
        user,
      } as unknown as PayloadRequest
      const response = await (
        verifyEmbedOnDemand.handler as (r: PayloadRequest) => Promise<Response>
      )(req)
      const body = (await response.json()) as { claim?: { status?: string; message?: string } }
      return { status: response.status, body: body.claim ?? {} }
    }

    const observation = (report: { mode?: 'inline' | 'iframe'; urlWritable?: boolean }) => ({
      mode: report.mode ?? 'inline',
      topLevel: true,
      urlWritable: report.urlWritable ?? true,
      paramPersisted: true,
      routing: 'path' as const,
      lastSeen: new Date().toISOString(),
    })

    /** A service with a primary page the widget has reported from. */
    const withReport = async (
      name: string,
      overrides: FixtureOverrides<Client> = {},
      report: { key?: string; mode?: 'inline' | 'iframe'; urlWritable?: boolean } = {},
    ) => {
      const client = await createClient(name, {
        site: { domain: DOMAIN, page: PAGE },
        ...overrides,
      })
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          // The column is closed and validated on every save, so a partial
          // record is refused — every key here is `required`.
          embedMetadata: {
            [report.key ?? MOUNT]: observation({
              mode: report.mode,
              urlWritable: report.urlWritable,
            }),
          },
        },
        overrideAccess: true,
      })
      return client
    }

    it('makes the first service in its region the home for its links', async () => {
      const region = await createRegion('claim-first')
      const client = await withReport('Claim First', { region: region.id })

      const { status, body } = await callClaim(client.id)
      expect(status).toBe(200)
      expect(body.status).toBe('claimed')
      expect((await readClient(client.id)).canonical?.owned).toBe(true)
    })

    it('refuses a page the widget has never reported', async () => {
      const region = await createRegion('claim-unreported')
      const client = await createClient('Claim Unreported', {
        region: region.id,
        site: { domain: DOMAIN, page: PAGE },
      })
      const { body } = await callClaim(client.id)
      expect(body.status).toBe('unknown-mount')
      expect((await readClient(client.id)).canonical?.owned ?? false).toBe(false)
    })

    it('reads no report from another site, whatever its path', async () => {
      // The report must come from the service's own domain, or its www twin.
      const region = await createRegion('claim-foreign-host')
      const client = await withReport(
        'Claim Foreign Host',
        { region: region.id },
        { key: `https://attacker.example${PAGE}` },
      )
      const { body } = await callClaim(client.id)
      expect(body.status).toBe('unknown-mount')
    })

    it('accepts a report from the www twin of the domain', async () => {
      const region = await createRegion('claim-www')
      const client = await withReport(
        'Claim Www',
        { region: region.id },
        { key: `https://www.${DOMAIN}${PAGE}` },
      )
      expect((await callClaim(client.id)).body.status).toBe('claimed')
    })

    it('refuses a page that cannot give each class its own link', async () => {
      for (const [name, report, track] of [
        ['Claim In A Frame', { mode: 'iframe' as const }, undefined],
        ['Claim Unwritable', { urlWritable: false }, undefined],
        ['Claim Iframe Track', {}, 'iframe' as const],
      ] as const) {
        const region = await createRegion(`claim-${name.toLowerCase().replace(/ /g, '-')}`)
        const client = await withReport(
          name,
          { region: region.id, site: { domain: DOMAIN, page: PAGE, track } },
          report,
        )
        const { body } = await callClaim(client.id)
        expect(body.status).toBe('no-class-addresses')
        expect((await readClient(client.id)).canonical?.owned ?? false).toBe(false)
      }
    })

    it('answers worldwide for a service with no region, and changes nothing', async () => {
      const client = await withReport('Claim Worldwide')
      const { body } = await callClaim(client.id)
      expect(body.status).toBe('worldwide')
      expect((await readClient(client.id)).canonical?.owned ?? false).toBe(false)
    })

    it('lets the sy-atlas-config fallback claim with no region of its own', async () => {
      const client = await withReport('Claim Fallback')
      await setFallbackClient(client.id)
      try {
        expect((await callClaim(client.id)).body.status).toBe('claimed')
        expect((await readClient(client.id)).canonical?.owned).toBe(true)
      } finally {
        await setFallbackClient(null)
      }
    })

    it('passes the uniqueness refusal through, naming the incumbent', async () => {
      const region = await createRegion('claim-contested')
      await createClient('Claim Incumbent', { region: region.id, canonical: { owned: true } })
      const challenger = await withReport('Claim Challenger', { region: region.id })

      const { body } = await callClaim(challenger.id)
      expect(body.status).toBe('taken')
      expect(body.message).toMatch(/maintainer/)
      expect(body.message).toContain('Claim Incumbent')
      expect((await readClient(challenger.id)).canonical?.owned ?? false).toBe(false)
    })

    it('says so, and changes nothing, when ownership is already on', async () => {
      const region = await createRegion('claim-already')
      const client = await withReport('Claim Already', {
        region: region.id,
        canonical: { owned: true },
      })

      const { body } = await callClaim(client.id)
      expect(body.status).toBe('already')
      expect((await readClient(client.id)).canonical?.owned).toBe(true)
    })

    it('lets a listed manager claim, though they may not write the flag themselves', async () => {
      // `canonical.owned` is admin-write-locked, so the claim is the one door a
      // manager has to it — and it opens only on the rules above.
      const lister = await testData.createManager(payload, {
        name: 'Claim Lister',
        email: 'claim-lister@example.com',
      })
      const region = await createRegion('claim-listed')
      const client = await withReport('Claim Listed', {
        region: region.id,
        managers: [lister.id],
        primaryContact: lister.id,
      })
      const listerUser = { ...lister, collection: 'managers' }

      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: { owned: true } },
        overrideAccess: false,
        user: listerUser as never,
      })
      expect((await readClient(client.id)).canonical?.owned ?? false).toBe(false)

      expect((await callClaim(client.id, listerUser)).body.status).toBe('claimed')
      expect((await readClient(client.id)).canonical?.owned).toBe(true)
    })

    it('refuses a caller who is not an active manager', async () => {
      const region = await createRegion('claim-anon')
      const client = await withReport('Claim Anon', { region: region.id })

      expect((await callClaim(client.id, { id: 1, collection: 'clients' })).status).toBe(403)
    })

    it('refuses a manager who does not manage this service', async () => {
      // The gate is the row's own read access, which is the document-manager
      // path — the same thing that makes the Install tab unreachable for them.
      const other = await testData.createManager(payload, {
        name: 'Other Manager',
        email: 'claim-other@example.com',
      })
      const region = await createRegion('claim-stranger')
      const client = await withReport('Claim Stranger', { region: region.id })

      const { status } = await callClaim(client.id, {
        id: other.id,
        collection: 'managers',
        type: 'manager',
      })
      expect(status).toBe(404)
    })
  })
})
