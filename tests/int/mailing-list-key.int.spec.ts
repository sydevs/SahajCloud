/**
 * The mailing-list provider key as a stored secret (#1109).
 *
 * Three guarantees, and the first is why the other two exist: Payload's live
 * preview posts the whole edit form's state to the preview iframe, so a key in
 * that state would reach sahajatlas.com. Keeping it out means no read returns
 * it, and that in turn means a key can only be set through an endpoint that
 * proves it first.
 *
 * ⚠ The fixtures store a **real** key. A probe against a service with none
 * returns `null` either way, which reads exactly like a protected field and
 * passes with the hole wide open.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { MailingListConfig } from '@/lib/mailingList/types'
import type { Client, Manager } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** What the provider says next. `null` means it accepted the credentials. */
let providerVerdict: string | null = null
/** The credentials the provider was last asked about, or `null` if never. */
let verifiedWith: MailingListConfig | null = null
/** Read through a call, so control-flow analysis cannot narrow it to `null`. */
const lastVerified = (): MailingListConfig | null => verifiedWith

vi.mock('@/lib/mailingList/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mailingList/providers')>()
  return {
    ...actual,
    adapterFor: () => ({
      verifyCredentials: async (config: MailingListConfig) => {
        verifiedWith = config
        return providerVerdict
      },
    }),
  }
})

const STORED_KEY = 'SECRET-MAILING-LIST-KEY-98765'

describe('Mailing-list key', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminManager: Manager
  let listedManager: Manager
  let outsideManager: Manager
  let service: Client
  let adminRest: RestClient
  let listedRest: RestClient
  let outsideRest: RestClient

  const managerReq = (manager: Manager): PayloadRequest =>
    ({
      context: {},
      headers: new Headers(),
      locale: 'en',
      payload,
      routeParams: {},
      user: { ...manager, collection: 'managers' },
    }) as unknown as PayloadRequest

  /** The row as the database holds it — the decrypting `afterRead` still runs. */
  const readPrivileged = (): Promise<Client> =>
    payload.findByID({ collection: 'clients', depth: 0, id: service.id, overrideAccess: true })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminManager = env.adminUser
    adminRest = await createRestClientAs(env, adminManager)

    listedManager = await testData.createManager(payload, { name: 'Listed Manager', roles: [] })
    outsideManager = await testData.createManager(payload, { name: 'Outside Manager', roles: [] })
    listedRest = await createRestClientAs(env, listedManager)
    outsideRest = await createRestClientAs(env, outsideManager)

    service = await testData.createClient(payload, adminManager.id, {
      apiKey: 'service-own-browser-key-for-mailing-list-spec',
      label: 'Mailing List Service',
      managers: [listedManager.id],
      mailingList: {
        apiKey: STORED_KEY,
        enabled: true,
        listId: 'list-1',
        provider: 'mailchimp',
      },
      roles: ['sahaj-atlas-client'],
    })
  })

  afterAll(async () => {
    providerVerdict = null
    await cleanup()
  })

  describe('reads', () => {
    it('encrypts the stored column and decrypts it for a privileged read', async () => {
      const row = await payload.db.findOne({
        collection: 'clients',
        req: managerReq(adminManager),
        where: { id: { equals: service.id } },
      })
      const column = (row as { mailingList?: { apiKey?: unknown } } | null)?.mailingList?.apiKey

      expect(column).toEqual(expect.any(String))
      expect(column).not.toBe(STORED_KEY)
      expect((await readPrivileged()).mailingList?.apiKey).toBe(STORED_KEY)
    })

    it.each([
      ['an admin', () => adminManager],
      ['a listed manager', () => listedManager],
    ])('omits the key from the read %s edits the document from', async (_who, manager) => {
      // This read is also what seeds the edit form's state, so it is what live
      // preview posts to the iframe.
      const doc = await payload.findByID({
        collection: 'clients',
        depth: 0,
        id: service.id,
        overrideAccess: false,
        req: managerReq(manager()),
      })

      expect(doc.mailingList?.enabled).toBe(true)
      expect(doc.mailingList?.apiKey).toBeUndefined()
    })

    it('declares the field out of form state on the booted config', () => {
      // `admin.disabled` is what keeps a field out of the form state live preview
      // posts — the same property `site` carries. Payload's own form-state builder
      // is not reachable from `@payloadcms/ui`'s exports map, so the read above is
      // the outcome and this is the declaration behind it.
      const group = payload.collections.clients.config.flattenedFields.find(
        (entry) => entry.name === 'mailingList',
      ) as {
        flattenedFields?: { admin?: { disabled?: boolean }; name: string; required?: boolean }[]
      }
      const field = group.flattenedFields?.find((entry) => entry.name === 'apiKey')

      expect(field?.admin?.disabled).toBe(true)
      expect(field?.required).toBeFalsy()
    })
  })

  describe('writes', () => {
    it('keeps the stored key through a form-shaped save that carries none', async () => {
      await payload.update({
        collection: 'clients',
        data: { mailingList: { enabled: true, listId: 'list-1', provider: 'mailchimp' } },
        id: service.id,
        overrideAccess: false,
        req: managerReq(listedManager),
      })

      expect((await readPrivileged()).mailingList?.apiKey).toBe(STORED_KEY)
    })

    it('still proves a changed credential against the provider on a form save', async () => {
      // ⚠ The key is absent from form state, so the save carries none — and the
      // provider is still handed the stored plaintext, because Payload
      // back-fills an omitted field from the decrypted stored document before
      // the hook runs. Asserting the argument is what tells that apart from a
      // guard that short-circuited and proved nothing.
      providerVerdict = 'That list does not exist.'
      verifiedWith = null

      await expect(
        payload.update({
          collection: 'clients',
          data: { mailingList: { enabled: true, listId: 'list-2', provider: 'mailchimp' } },
          id: service.id,
          overrideAccess: false,
          req: managerReq(listedManager),
        }),
      ).rejects.toThrow(/That list does not exist/)

      expect(lastVerified()?.apiKey).toBe(STORED_KEY)
      expect(lastVerified()?.listId).toBe('list-2')
      providerVerdict = null
    })

    it('proves the stored credentials again when a list is switched back on', async () => {
      // A disabled list returns early from the hook, so credentials can be
      // edited while nothing proves them. Switching the list on is therefore
      // the one save that has to ask, however little else changed.
      const toggled = await testData.createClient(payload, adminManager.id, {
        apiKey: 'toggled-service-key-for-mailing-list-spec',
        label: 'Toggled Service',
        managers: [listedManager.id],
        mailingList: {
          apiKey: STORED_KEY,
          enabled: true,
          listId: 'list-1',
          provider: 'mailchimp',
        },
        roles: ['sahaj-atlas-client'],
      })
      const save = (enabled: boolean) =>
        payload.update({
          collection: 'clients',
          data: { mailingList: { enabled } },
          id: toggled.id,
          overrideAccess: false,
          req: managerReq(listedManager),
        })

      await save(false)
      providerVerdict = 'That API key was refused.'

      await expect(save(true)).rejects.toThrow(/That API key was refused/)
      providerVerdict = null
    })

    it('refuses the endpoint on a service with no atlas role', async () => {
      // `lockTabs` ANDs the Atlas tab's own rule onto every field it holds, and
      // `payload.update` strips what it refuses rather than erroring — so a door
      // gating on less would answer 200 for a write that stored nothing.
      const appKey = await testData.createClient(payload, adminManager.id, {
        apiKey: 'app-key-for-mailing-list-spec',
        label: 'App Key',
        managers: [listedManager.id],
        roles: ['wemeditate-web-client'],
      })
      const { status } = await listedRest(`/api/clients/${appKey.id}/mailing-list-key`, {
        json: { apiKey: 'k', listId: 'list-1', provider: 'mailchimp' },
        method: 'POST',
      })

      expect(status).toBe(403)
    })

    it('refuses a manager who does not manage the service', async () => {
      const { status } = await outsideRest(`/api/clients/${service.id}/mailing-list-key`, {
        json: { apiKey: 'nope', listId: 'list-1', provider: 'mailchimp' },
        method: 'POST',
      })

      expect(status).toBe(404)
      expect((await readPrivileged()).mailingList?.apiKey).toBe(STORED_KEY)
    })

    it('stores nothing when the provider refuses the key', async () => {
      providerVerdict = 'That API key was refused.'
      const { body, status } = await listedRest(`/api/clients/${service.id}/mailing-list-key`, {
        json: { apiKey: 'wrong-key', listId: 'list-1', provider: 'mailchimp' },
        method: 'POST',
      })

      expect(status).toBe(400)
      expect(JSON.stringify(body)).toContain('That API key was refused.')
      expect((await readPrivileged()).mailingList?.apiKey).toBe(STORED_KEY)
    })

    it('stores the key once the provider accepts it, and reports only its tail', async () => {
      providerVerdict = null
      const { status } = await listedRest(`/api/clients/${service.id}/mailing-list-key`, {
        json: { apiKey: 'NEW-PROVEN-KEY-4321', listId: 'list-1', provider: 'mailchimp' },
        method: 'POST',
      })
      expect(status).toBe(200)
      expect((await readPrivileged()).mailingList?.apiKey).toBe('NEW-PROVEN-KEY-4321')

      const hint = await adminRest(`/api/clients/${service.id}/mailing-list-key`)
      expect(hint.status).toBe(200)
      expect(hint.body).toEqual({ last4: '4321', set: true })
    })
  })
})
