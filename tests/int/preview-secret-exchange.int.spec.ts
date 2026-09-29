/**
 * The preview session exchange, driven the way the smoke lane drives it (#840).
 *
 * `tests/unit/preview-secret-exchange.spec.ts` covers WHERE the route exists.
 * This covers what it does once it does: the secret is compared against the
 * environment rather than against anything stored, the account is the one the
 * environment names rather than one the caller picks, and everything else is
 * refused with one answer.
 *
 * ⚠ **The environment is set in `vi.hoisted`, and it has to be.** `serverEnv`
 * parses at import, and `previewSecretExchange()` runs when `testHelpers`
 * constructs the plugin — so an assignment in `beforeAll` would run after both,
 * the route would silently not exist, and every refusal below would still pass.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createAnonRestClient,
  createRestClientWithAuth,
  type RestClient,
} from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { PREVIEW_ADMIN_EMAIL, PREVIEW_ADMIN_PASSWORD } = vi.hoisted(() => {
  const email = 'preview-admin@sydevelopers.test'
  const password = 'a-preview-secret-value'
  process.env.RAILWAY_ENVIRONMENT_NAME = 'pr-840'
  process.env.PREVIEW_ADMIN_EMAIL = email
  process.env.PREVIEW_ADMIN_PASSWORD = password
  return { PREVIEW_ADMIN_EMAIL: email, PREVIEW_ADMIN_PASSWORD: password }
})

const EXCHANGE_PATH = '/api/managers/exchange-preview-secret'

describe('POST /api/managers/exchange-preview-secret', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironment>>
  let anon: RestClient
  let cleanup: () => Promise<void>
  let previewAdminId: number | string

  /** What `seedPreviewAdmin` leaves behind: present, admin, accepted, no password. */
  const seedPreviewAdmin = async () => {
    const created = await testData.createManager(payload, {
      name: 'Preview Admin',
      email: PREVIEW_ADMIN_EMAIL,
      type: 'admin',
      _verified: true,
    })
    return created.id
  }

  const exchange = (json: unknown) => anon(EXCHANGE_PATH, { method: 'POST', json })

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    anon = createAnonRestClient(env)
    previewAdminId = await seedPreviewAdmin()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('trades the secret for a session that authenticates', async () => {
    const res = await exchange({ password: PREVIEW_ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    const { token } = res.body as { token?: string }
    expect(token).toBeTruthy()
    // The cookie is the browser's half of the same session.
    expect(res.headers.get('Set-Cookie')).toBeTruthy()

    const asAdmin = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
    const me = await asAdmin('/api/managers/me')
    expect((me.body as { user?: { email?: string } }).user?.email).toBe(PREVIEW_ADMIN_EMAIL)
  })

  it('refuses a wrong secret', async () => {
    expect((await exchange({ password: 'wrong' })).status).toBe(403)
  })

  it('refuses a prefix of the secret, which a length-blind compare would take', async () => {
    const res = await exchange({ password: PREVIEW_ADMIN_PASSWORD.slice(0, -1) })

    expect(res.status).toBe(403)
  })

  it('signs in the address the environment names, never one the caller does', async () => {
    // ⚠ The route asks for no address, so an `email` in the body is stripped
    // rather than honoured. A second manager on the preview is unreachable with
    // this secret — the blast radius stays the account the deploy provisions.
    const other = await testData.createManager(payload, { name: 'Not The Preview Admin' })

    const res = await exchange({ email: other.email, password: PREVIEW_ADMIN_PASSWORD })

    expect(res.status).toBe(200)
    const { token } = res.body as { token?: string }
    const asWhoever = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
    const me = await asWhoever('/api/managers/me')
    expect((me.body as { user?: { email?: string } }).user?.email).toBe(PREVIEW_ADMIN_EMAIL)
  })

  it('refuses a malformed body rather than throwing', async () => {
    expect((await exchange({ password: '' })).status).toBe(400)
    expect((await exchange({})).status).toBe(400)
  })

  it('refuses an unaccepted admin, rather than minting a token nobody can use', async () => {
    await payload.update({
      collection: 'managers',
      id: previewAdminId,
      data: { _verified: false },
      overrideAccess: true,
    })

    expect((await exchange({ password: PREVIEW_ADMIN_PASSWORD })).status).toBe(403)

    await payload.update({
      collection: 'managers',
      id: previewAdminId,
      data: { _verified: true },
      overrideAccess: true,
    })
  })

  it('refuses the preview admin once they are deactivated', async () => {
    await payload.update({
      collection: 'managers',
      id: previewAdminId,
      data: { type: 'inactive' },
      overrideAccess: true,
    })

    expect((await exchange({ password: PREVIEW_ADMIN_PASSWORD })).status).toBe(403)
  })
})
