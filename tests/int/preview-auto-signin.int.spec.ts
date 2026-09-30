/**
 * The preview admin's auto sign-in, driven the way the smoke lane drives it (#840).
 *
 * `tests/unit/preview-auto-signin.spec.ts` covers WHO the option is set for. This
 * covers what it does once it is: the one address the environment names is signed
 * in on request, every other address is answered identically and mailed instead,
 * and an account that could not hold a session is refused rather than handed a
 * token nobody can spend.
 *
 * ⚠ **The environment is set in `vi.hoisted`, and it has to be.** `serverEnv`
 * parses at import, and `previewAdminEmail()` runs when `testHelpers`
 * constructs the plugin — so an assignment in `beforeAll` would run after both,
 * the option would silently be unset, and every "no token" case below would still
 * pass.
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

const { PREVIEW_ADMIN_EMAIL } = vi.hoisted(() => {
  const email = 'preview-admin@sydevelopers.test'
  process.env.RAILWAY_ENVIRONMENT_NAME = 'pr-840'
  process.env.PREVIEW_ADMIN_EMAIL = email
  return { PREVIEW_ADMIN_EMAIL: email }
})

const REQUEST_PATH = '/api/managers/request-magic-link'

describe('POST /api/managers/request-magic-link, on a Railway preview', () => {
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

  const request = (json: unknown) => anon(REQUEST_PATH, { method: 'POST', json })
  const tokenFrom = (body: unknown) => (body as { token?: string }).token

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

  it('signs the preview admin in, with a session that authenticates', async () => {
    const res = await request({ email: PREVIEW_ADMIN_EMAIL })

    expect(res.status).toBe(200)
    const token = tokenFrom(res.body)
    expect(token).toBeTruthy()
    // The cookie is the browser's half of the same session.
    expect(res.headers.get('Set-Cookie')).toBeTruthy()

    const asAdmin = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
    const me = await asAdmin('/api/managers/me')
    expect((me.body as { user?: { email?: string } }).user?.email).toBe(PREVIEW_ADMIN_EMAIL)
  })

  it('signs in again straight away, because the throttle must not bound a test run', async () => {
    expect(tokenFrom((await request({ email: PREVIEW_ADMIN_EMAIL })).body)).toBeTruthy()
  })

  it('takes the address as typed, whatever its case', async () => {
    const shouted = PREVIEW_ADMIN_EMAIL.toUpperCase()

    expect(tokenFrom((await request({ email: shouted })).body)).toBeTruthy()
  })

  it('signs nobody else in — another manager is mailed, and told nothing', async () => {
    // ⚠ The failure this exists for: the address IS the credential here, so a
    // second manager on the preview must stay unreachable. The answer is the same
    // `{ ok: true }` either way, so the absent token is the whole assertion.
    const other = await testData.createManager(payload, { name: 'Not The Preview Admin' })

    const res = await request({ email: other.email })

    expect(res.status).toBe(200)
    expect(tokenFrom(res.body)).toBeUndefined()
  })

  it('refuses a malformed body rather than throwing', async () => {
    expect((await request({ email: 'not-an-address' })).status).toBe(400)
    expect((await request({})).status).toBe(400)
  })

  it('mints nothing for an unaccepted admin, whom the JWT strategy would refuse', async () => {
    await payload.update({
      collection: 'managers',
      id: previewAdminId,
      data: { _verified: false },
      overrideAccess: true,
    })

    expect(tokenFrom((await request({ email: PREVIEW_ADMIN_EMAIL })).body)).toBeUndefined()

    await payload.update({
      collection: 'managers',
      id: previewAdminId,
      data: { _verified: true },
      overrideAccess: true,
    })
  })

  it('mints nothing once the preview admin is deactivated', async () => {
    await payload.update({
      collection: 'managers',
      id: previewAdminId,
      data: { type: 'inactive' },
      overrideAccess: true,
    })

    expect(tokenFrom((await request({ email: PREVIEW_ADMIN_EMAIL })).body)).toBeUndefined()
  })
})
