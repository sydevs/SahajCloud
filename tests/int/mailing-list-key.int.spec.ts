/**
 * The mailing-list provider key as a `secretField` (#1109).
 *
 * Three guarantees, and the first is why the other two exist: Payload's live
 * preview posts the whole edit form's state to the preview iframe, so a key in
 * that state would reach sahajatlas.com. Keeping it out means no read returns
 * it, and that in turn means a key reaches the row only through a staged token
 * the form's own Save applies — the secret routes stage, they never write.
 *
 * ⚠ The fixtures store a **real** key. A probe against a service with none
 * returns `null` either way, which reads exactly like a protected field and
 * passes with the hole wide open.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
const SECRET_PATH = 'mailingList.apiKey'

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
  const readPrivileged = (id: number = service.id): Promise<Client> =>
    payload.findByID({ collection: 'clients', depth: 0, id, overrideAccess: true })

  const secretUrl = (id: number) => `/api/clients/${id}/secrets/${SECRET_PATH}`

  /** Stage a key as `rest`, answering the token. */
  const stage = async (
    rest: RestClient,
    value: string,
    id: number = service.id,
    siblings: Record<string, unknown> = { listId: 'list-1', provider: 'mailchimp' },
  ) => {
    const { body, status } = await rest(secretUrl(id), {
      json: { siblings, value },
      method: 'POST',
    })
    return { body, status, token: (body as { token?: string }).token }
  }

  /** A form-shaped Save carrying only the control's instruction. */
  const saveWith = (rest: RestClient, change: string | null, id: number = service.id) =>
    rest(`/api/clients/${id}`, {
      json: { mailingList: { apiKeyChange: change } },
      method: 'PATCH',
    })

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
      mailingList: { apiKey: STORED_KEY, listId: 'list-1', provider: 'mailchimp' },
      roles: ['sahaj-atlas-client'],
    })
  })

  // A failed assertion must not leave the next case a refusing provider.
  beforeEach(() => {
    providerVerdict = null
    verifiedWith = null
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

      expect(doc.mailingList?.provider).toBe('mailchimp')
      expect(doc.mailingList?.apiKey).toBeUndefined()
      expect(doc.mailingList?.apiKeyChange ?? null).toBeNull()
    })

    it('declares the key out of form state, behind a control that comes first', () => {
      // `admin.disabled` is what keeps a field out of the form state live preview
      // posts. Payload's form-state builder is not reachable from
      // `@payloadcms/ui`'s exports map, so the read above is the outcome and this
      // is the declaration behind it.
      const group = payload.collections.clients.config.flattenedFields.find(
        (entry) => entry.name === 'mailingList',
      ) as {
        flattenedFields: { admin?: { disabled?: boolean }; name: string; required?: boolean }[]
      }
      const names = group.flattenedFields.map((entry) => entry.name)
      const field = group.flattenedFields.find((entry) => entry.name === 'apiKey')

      expect(field?.admin?.disabled).toBe(true)
      expect(field?.required).toBeFalsy()
      expect(names.indexOf('apiKeyChange')).toBeLessThan(names.indexOf('apiKey'))
    })

    it('reports only the stored key’s tail', async () => {
      const { body, status } = await listedRest(secretUrl(service.id))
      expect(status).toBe(200)
      expect(body).toEqual({ last4: STORED_KEY.slice(-4) })
    })
  })

  describe('saves', () => {
    it('keeps the stored key through a form-shaped save that carries none', async () => {
      await payload.update({
        collection: 'clients',
        data: { mailingList: { listId: 'list-1', provider: 'mailchimp' } },
        id: service.id,
        overrideAccess: false,
        req: managerReq(listedManager),
      })

      expect((await readPrivileged()).mailingList?.apiKey).toBe(STORED_KEY)
    })

    it('still proves a changed credential against the provider on a form save', async () => {
      // ⚠ The save carries no key — and the provider is still handed the stored
      // plaintext, because Payload back-fills an omitted field from the decrypted
      // stored document before the hook runs. Asserting the argument is what
      // tells that apart from a guard that short-circuited and proved nothing.
      providerVerdict = 'That list does not exist.'
      verifiedWith = null

      await expect(
        payload.update({
          collection: 'clients',
          data: { mailingList: { listId: 'list-2', provider: 'mailchimp' } },
          id: service.id,
          overrideAccess: false,
          req: managerReq(listedManager),
        }),
      ).rejects.toThrow(/That list does not exist/)

      expect(lastVerified()?.apiKey).toBe(STORED_KEY)
      expect(lastVerified()?.listId).toBe('list-2')
    })

    it('proves the stored credentials again when a provider is chosen again', async () => {
      // Clearing the provider switches the list off and returns early from the
      // hook, so credentials can be edited while nothing proves them. Choosing the
      // provider again is therefore the one save that has to ask.
      const toggled = await testData.createClient(payload, adminManager.id, {
        apiKey: 'toggled-service-key-for-mailing-list-spec',
        label: 'Toggled Service',
        managers: [listedManager.id],
        mailingList: { apiKey: STORED_KEY, listId: 'list-1', provider: 'mailchimp' },
        roles: ['sahaj-atlas-client'],
      })
      const save = (provider: 'mailchimp' | null) =>
        payload.update({
          collection: 'clients',
          data: { mailingList: { provider } },
          id: toggled.id,
          overrideAccess: false,
          req: managerReq(listedManager),
        })

      await save(null)
      providerVerdict = 'That API key was refused.'

      await expect(save('mailchimp')).rejects.toThrow(/That API key was refused/)
    })
  })

  describe('staging', () => {
    it('refuses a service with no atlas role', async () => {
      // `lockTabs` ANDs the Atlas tab's own rule onto every field it holds, and a
      // save strips what it refuses rather than erroring — so a route gating on
      // less would stage a key no Save could apply.
      const appKey = await testData.createClient(payload, adminManager.id, {
        apiKey: 'app-key-for-mailing-list-spec',
        label: 'App Key',
        managers: [listedManager.id],
        roles: ['wemeditate-web-client'],
      })

      expect((await stage(listedRest, 'k', appKey.id)).status).toBe(403)
    })

    it('refuses a manager who does not manage the service', async () => {
      expect((await stage(outsideRest, 'nope')).status).toBe(404)
      expect((await outsideRest(secretUrl(service.id))).status).toBe(404)
    })

    it('refuses a path that is not a secret', async () => {
      const { status } = await listedRest(`/api/clients/${service.id}/secrets/mailingList.listId`)
      expect(status).toBe(404)
    })

    it('checks the key against the form’s unsaved values, and stages nothing it refuses', async () => {
      providerVerdict = 'That API key was refused.'
      verifiedWith = null
      const { body, status, token } = await stage(listedRest, 'wrong-key', service.id, {
        listId: 'list-unsaved',
        provider: 'mailchimp',
      })

      expect(status).toBe(400)
      expect(JSON.stringify(body)).toContain('That API key was refused.')
      expect(token).toBeUndefined()
      expect(lastVerified()).toMatchObject({ apiKey: 'wrong-key', listId: 'list-unsaved' })
    })

    it('stores nothing until Save applies the token, then proves it again', async () => {
      const { status, token } = await stage(listedRest, 'NEW-PROVEN-KEY-4321')
      expect(status).toBe(200)
      expect((await readPrivileged()).mailingList?.apiKey).toBe(STORED_KEY)

      verifiedWith = null
      const saved = await saveWith(listedRest, `stage:${token}`)
      expect(saved.status).toBe(200)
      expect((await readPrivileged()).mailingList?.apiKey).toBe('NEW-PROVEN-KEY-4321')
      expect(lastVerified()?.apiKey).toBe('NEW-PROVEN-KEY-4321')

      // Spent: the same token cannot be applied twice.
      expect((await saveWith(listedRest, `stage:${token}`)).status).toBe(400)
    })

    it('applies a token only for the person and service it was staged for', async () => {
      const { token } = await stage(listedRest, 'SOMEONE-ELSES-KEY-1111')
      const other = await testData.createClient(payload, adminManager.id, {
        apiKey: 'other-service-key-for-mailing-list-spec',
        label: 'Other Service',
        managers: [listedManager.id],
        mailingList: { apiKey: STORED_KEY, listId: 'list-1', provider: 'mailchimp' },
        roles: ['sahaj-atlas-client'],
      })

      expect((await saveWith(adminRest, `stage:${token}`)).status).toBe(400)
      expect((await saveWith(listedRest, `stage:${token}`, other.id)).status).toBe(400)
      expect((await readPrivileged(other.id)).mailingList?.apiKey).toBe(STORED_KEY)
    })

    it('refuses an expired token', async () => {
      const { token } = await stage(listedRest, 'EXPIRED-KEY-2222')
      const key = `secret-stage:${token}`
      const entry = await payload.kv.get<{ expiresAt: number }>(key)
      await payload.kv.set(key, { ...entry, expiresAt: Date.now() - 1 })

      expect((await saveWith(listedRest, `stage:${token}`)).status).toBe(400)
      expect(await payload.kv.get(key)).toBeNull()
    })

    it('removes the key only with the provider, without asking the provider', async () => {
      const removable = await testData.createClient(payload, adminManager.id, {
        apiKey: 'removable-service-key-for-mailing-list-spec',
        label: 'Removable Service',
        managers: [listedManager.id],
        mailingList: { apiKey: STORED_KEY, listId: 'list-1', provider: 'mailchimp' },
        roles: ['sahaj-atlas-client'],
      })

      verifiedWith = null
      // A key-less list would read as one and deliver nothing.
      const refused = await saveWith(listedRest, 'remove', removable.id)
      expect(refused.status).toBe(400)
      expect(JSON.stringify(refused.body)).toContain('clear Mailing List Provider')
      expect((await readPrivileged(removable.id)).mailingList?.apiKey).toBe(STORED_KEY)

      const { status } = await listedRest(`/api/clients/${removable.id}`, {
        json: { mailingList: { apiKeyChange: 'remove', provider: null } },
        method: 'PATCH',
      })
      expect(status).toBe(200)
      // `''`, not `null`, so `isMailingListConfigured` short-circuits
      // `validateMailingList` and `LIST_ELIGIBLE` drops the service.
      expect((await readPrivileged(removable.id)).mailingList?.apiKey).toBe('')
      expect(lastVerified()).toBeNull()
      expect((await listedRest(secretUrl(removable.id))).body).toEqual({ last4: null })
    })

    it('ignores a removal from a manager the Atlas tab locks out', async () => {
      // A save strips a field its lock refuses rather than erroring, so the
      // answer is a 200 that must have changed nothing.
      const appKey = await testData.createClient(payload, adminManager.id, {
        apiKey: 'locked-app-key-for-mailing-list-spec',
        label: 'Locked App Key',
        managers: [listedManager.id],
        mailingList: { apiKey: STORED_KEY, listId: 'list-1', provider: 'mailchimp' },
        roles: ['wemeditate-web-client'],
      })

      expect((await saveWith(listedRest, 'remove', appKey.id)).status).toBe(200)
      expect((await readPrivileged(appKey.id)).mailingList?.apiKey).toBe(STORED_KEY)
    })
  })
})
