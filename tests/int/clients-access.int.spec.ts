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
import { createTestEnvironment } from '../utils/testHelpers'

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
      payload,
      headers: new Headers(),
      routeParams: {},
      context: {},
      user: {
        id: atlasClient.id,
        collection: 'clients',
        _status: 'published',
        roles: ['sahaj-atlas-client'],
        allowedDomains: null,
      },
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
  async function restGet(path: string): Promise<{ status: number; body: unknown }> {
    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000${path}`, {
        headers: { Authorization: `clients API-Key ${ATLAS_API_KEY}` },
      }),
    })
    return { status: response.status, body: await response.json() }
  }

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
      const { status, body } = await restGet(
        '/api/clients/me?depth=0&select[name]=true&select[canonical]=true&select[apiKey]=true',
      )

      expect(status).toBe(200)
      const user = (body as { user: Client | null }).user
      expect(user?.name).toBe('Atlas Widget')
      expect(user?.apiKey).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain(ATLAS_API_KEY)
    })

    it('leaves a manager reading and regenerating a key alone', async () => {
      const read = (await payload.findByID({
        collection: 'clients',
        id: otherClient.id,
        depth: 0,
        overrideAccess: false,
        req: managerReq(adminManager),
      })) as Client
      expect(read.apiKey).toBe(OTHER_API_KEY)

      const regenerated = (await payload.update({
        collection: 'clients',
        id: otherClient.id,
        data: { apiKey: 'REGENERATED-OTHER-SERVICE-KEY' },
        overrideAccess: false,
        req: managerReq(adminManager),
      })) as Client
      expect(regenerated.apiKey).toBe('REGENERATED-OTHER-SERVICE-KEY')

      await payload.update({
        collection: 'clients',
        id: otherClient.id,
        data: { apiKey: OTHER_API_KEY },
        overrideAccess: true,
      })
    })

    it('sanitizes clients to exactly one apiKey field', () => {
      // `mergeBaseFields` matches by name only at the level it is handed. A copy
      // nested in a tab would leave the base field appended beside it.
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
        // Globals are inside the usage plugin, so this read really does need a
        // `select` — unlike the bare `/api/clients` case above.
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
        data: { name: 'OTHER SERVICE' },
        overrideAccess: false,
        req: managerReq(listedManager),
      })) as Client
      expect(updated.name).toBe('OTHER SERVICE')
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
    it('still resolves a client from its API key', async () => {
      const { status, body } = await restGet('/api/clients/me?depth=0&select[name]=true')

      expect(status).toBe(200)
      expect((body as { user: Client | null }).user?.id).toBe(atlasClient.id)
    })
  })
})
