/**
 * Who may read a `clients` row, and who may read the `apiKey` on it (#822).
 *
 * Two layers, and neither does the other's job:
 *
 * - `clients` is in `RESTRICTED_COLLECTIONS`, so implicit shared read no longer
 *   hands every published key every other service's document;
 * - `Clients.apiKey` carries `managersOnlyFieldAccess`, which is the only thing
 *   covering the one read restriction deliberately does not reach — a client's
 *   own row, answered by the self-access bypass at `GET /api/clients/me`.
 *
 * ⚠ Every read case here goes through real access control, and the other
 * client's fixture **stores an actual key**. A probe against a client with no
 * `apiKey` set returns `null` for it either way, which reads exactly like a
 * protected field and passes with the hole wide open.
 */
import type { Payload, PayloadRequest } from 'payload'

import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SKIP_AVAILABLE_LOCALES_CHECK } from '@/fields/availableLocalesField'
import type { Client, Manager } from '@/payload-types'

import { testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/** The reader's own key. Plaintext, because `restGet` authenticates with it. */
const ATLAS_API_KEY = 'atlas-widget-key-for-clients-access-spec'
/** The credential this whole ticket is about not disclosing. */
const OTHER_API_KEY = 'SECRET-OTHER-SERVICE-KEY-12345'

describe('Clients access', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let config: Awaited<ReturnType<typeof createTestEnvironment>>['config']
  let adminManager: Manager
  let listedManager: Manager
  let outsideManager: Manager
  let atlasClient: Client
  let otherClient: Client

  /** A published `sahaj-atlas-client`, the key that ships in the browser. */
  const atlasReq = (): PayloadRequest =>
    ({
      ...createClientAuthenticatedRequest(atlasClient.id, ATLAS_API_KEY, ['sahaj-atlas-client']),
      payload,
      routeParams: {},
      context: {},
    }) as unknown as PayloadRequest

  const managerReq = (manager: Manager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      routeParams: {},
      locale: 'en',
      context: {},
      user: { ...manager, collection: 'managers' },
    }) as unknown as PayloadRequest

  /** A real REST call, authenticated by the atlas client's own API key. */
  async function rest(
    path: string,
    init: { method?: string; json?: unknown } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
      Authorization: `clients API-Key ${ATLAS_API_KEY}`,
    }
    if (init.json !== undefined) headers['Content-Type'] = 'application/json'
    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
      }),
    })
    return { status: response.status, body: await response.json() }
  }

  const restGet = (path: string) => rest(path)

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    config = env.config
    adminManager = env.adminUser

    listedManager = await testData.createManager(payload, {
      name: 'Listed Manager',
      roles: ['atlas-manager'],
    })
    outsideManager = await testData.createManager(payload, {
      name: 'Outside Manager',
      roles: ['atlas-manager'],
    })

    atlasClient = await testData.createClient(payload, adminManager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
      // Payload returns `apiKey: null` from a create — the column is encrypted —
      // so `restGet` needs the plaintext value it was seeded with.
      apiKey: ATLAS_API_KEY,
    })
    otherClient = await testData.createClient(payload, listedManager.id, {
      name: 'OTHER SERVICE',
      roles: ['wemeditate-web-client'],
      managers: [listedManager.id],
      primaryContact: listedManager.id,
      apiKey: OTHER_API_KEY,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the field lock on apiKey', () => {
    it('keeps a client out of its own key, which restriction cannot', async () => {
      const own = (await payload.findByID({
        collection: 'clients',
        id: atlasClient.id,
        depth: 0,
        overrideAccess: false,
        req: atlasReq(),
      })) as Client

      // Self-access allows the read, so the document itself must come back — an
      // assertion that only proved the read failed would prove nothing here.
      expect(own.name).toBe('Atlas Widget')
      expect(own.apiKey).toBeUndefined()
    })

    it('answers GET /api/clients/me with the boot fields and no key', async () => {
      // The widget's own boot read, field for field: `getClient` in
      // sydevs/SahajAtlasWeb `src/config/api/fetch.ts` selects these at depth 1
      // and populates `regions`. `apiKey` is added here so the refusal is the
      // assertion rather than an absent request.
      const { status, body } = await restGet(
        '/api/clients/me?depth=1&select[name]=true&select[color1]=true&select[color2]=true' +
          '&select[color3]=true&select[allowedDomains]=true&select[clientId]=true' +
          '&select[region]=true&select[canonical]=true&select[apiKey]=true',
      )

      expect(status).toBe(200)
      const user = (body as { user: Client | null }).user
      expect(user?.name).toBe('Atlas Widget')
      expect(user?.apiKey).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain(ATLAS_API_KEY)
    })

    it('leaves a manager reading and regenerating a key alone', async () => {
      // Its own row, so nothing later in the file depends on restoring a value
      // this case overwrites.
      const rotating = await testData.createClient(payload, adminManager.id, {
        name: 'Rotating Service',
        apiKey: 'ROTATING-SERVICE-KEY-BEFORE',
      })

      const read = (await payload.findByID({
        collection: 'clients',
        id: rotating.id,
        depth: 0,
        overrideAccess: false,
        req: managerReq(adminManager),
      })) as Client
      expect(read.apiKey).toBe('ROTATING-SERVICE-KEY-BEFORE')

      const regenerated = (await payload.update({
        collection: 'clients',
        id: rotating.id,
        data: { apiKey: 'ROTATING-SERVICE-KEY-AFTER' },
        overrideAccess: false,
        req: managerReq(adminManager),
      })) as Client
      expect(regenerated.apiKey).toBe('ROTATING-SERVICE-KEY-AFTER')
    })

    it('hands back no key from POST /api/clients/refresh-token', async () => {
      // ⚠ The second self-read, and the one field access alone does not cover.
      // Payload's `refreshOperation` re-reads the document with `findByID` and
      // no `overrideAccess: false`, so it defaults to true and every field lock
      // is skipped — unlike `meOperation`, which passes the flag. The collection
      // `afterRead` hook is what closes it. `disableLocalStrategy` does not:
      // `refresh` is the one auth operation that does not refuse on that flag.
      const { status, body } = await rest('/api/clients/refresh-token', { method: 'POST' })

      expect(status).toBe(200)
      expect(JSON.stringify(body)).not.toContain(ATLAS_API_KEY)
      expect((body as { user?: Client }).user?.apiKey).toBeUndefined()
    })

    it('refuses a client rewriting its own key', async () => {
      // Self-access grants a published client `update` on its own row, so the
      // field lock is the only thing standing between a browser-shipped key and
      // an attacker pinning the credential to a value they chose. Payload
      // strips a denied field rather than erroring, so the PATCH still answers
      // 200 — only the read-back says whether it took.
      await rest(`/api/clients/${atlasClient.id}`, {
        method: 'PATCH',
        json: { apiKey: 'ATTACKER-CHOSEN-KEY' },
      })

      const after = (await payload.findByID({
        collection: 'clients',
        id: atlasClient.id,
        depth: 0,
        overrideAccess: true,
      })) as Client
      expect(after.apiKey).toBe(ATLAS_API_KEY)
    })

    it('sanitizes clients to exactly one apiKey field', () => {
      // The nesting trap in `Clients.ts` — a mis-placed override appends the
      // base field instead of merging with it.
      const names = payload.collections.clients.config.flattenedFields.map((field) =>
        'name' in field ? field.name : null,
      )
      expect(names.filter((name) => name === 'apiKey')).toHaveLength(1)
    })
  })

  describe('the collection restriction', () => {
    it('refuses a published client the clients collection outright', async () => {
      await expect(
        payload.find({
          collection: 'clients',
          depth: 0,
          pagination: false,
          overrideAccess: false,
          req: atlasReq(),
        }),
      ).rejects.toThrow()
    })

    it('refuses it with no select, the shape no gate requires one for', async () => {
      // `clients` is outside the usage plugin (`usagePlugin.ts`), so none of the
      // four client gates run here — a bare read needs no query shaping at all.
      const { status, body } = await restGet('/api/clients')

      expect(status).toBe(403)
      expect(JSON.stringify(body)).not.toContain(OTHER_API_KEY)
    })

    it('refuses another client by id', async () => {
      await expect(
        payload.findByID({
          collection: 'clients',
          id: otherClient.id,
          depth: 0,
          overrideAccess: false,
          req: atlasReq(),
        }),
      ).rejects.toThrow()
    })

    it('populates no key through sy-atlas-config at depth 1', async () => {
      await payload.updateGlobal({
        slug: 'sy-atlas-config',
        data: { availableLocales: ['en'], canonicalFallbackClient: otherClient.id },
        overrideAccess: true,
        // Nothing is published in this suite's schema, and `availableLocales`
        // refuses an unpublished locale. The flag is the local-API escape the
        // field ships for exactly this.
        context: { [SKIP_AVAILABLE_LOCALES_CHECK]: true },
      })

      const global = await payload.findGlobal({
        slug: 'sy-atlas-config',
        depth: 1,
        // Globals are inside the usage plugin, so its select gate applies here.
        select: { canonicalFallbackClient: true },
        overrideAccess: false,
        req: atlasReq(),
      })

      const fallback = (global as { canonicalFallbackClient?: Client | number | null })
        .canonicalFallbackClient
      // A bare id is the pass: population runs under the caller's grants, and the
      // caller no longer reaches `clients`.
      const populatedKey =
        typeof fallback === 'object' && fallback !== null ? fallback.apiKey : undefined
      expect(populatedKey).toBeUndefined()
      expect(JSON.stringify(global)).not.toContain(OTHER_API_KEY)
    })

    it('still lets a listed manager read and update that service', async () => {
      const { docs } = (await payload.find({
        collection: 'clients',
        depth: 0,
        pagination: false,
        overrideAccess: false,
        req: managerReq(listedManager),
      })) as { docs: Client[] }

      expect(docs.map((doc) => doc.id)).toEqual([otherClient.id])

      const updated = (await payload.update({
        collection: 'clients',
        id: otherClient.id,
        data: { name: 'OTHER SERVICE, RENAMED' },
        overrideAccess: false,
        req: managerReq(listedManager),
      })) as Client
      expect(updated.name).toBe('OTHER SERVICE, RENAMED')
    })

    it('gives a manager listed on nothing no clients at all', async () => {
      await expect(
        payload.find({
          collection: 'clients',
          depth: 0,
          pagination: false,
          overrideAccess: false,
          req: managerReq(outsideManager),
        }),
      ).rejects.toThrow()
    })
  })

  describe('authentication', () => {
    it('still authorises an ordinary read for a key holder', async () => {
      // Not `/clients/me`, which the field-lock cases already drive. A project
      // collection proves the key both authenticates and still carries its
      // role's grants, which is what the field lock could have broken had auth
      // read `apiKey` rather than the `apiKeyIndex` hash.
      const { status, body } = await restGet('/api/regions?depth=0&select[id]=true&limit=1')

      expect(status).toBe(200)
      expect(body).toHaveProperty('docs')
    })
  })
})
