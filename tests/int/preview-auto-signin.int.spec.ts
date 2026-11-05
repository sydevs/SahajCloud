/**
 * A preview's auto sign-in, driven the way CI and the loop drive it (#840).
 *
 * `tests/unit/preview-auto-signin.spec.ts` covers WHO the option is set for.
 * This covers what it does once it is: **any** manager in the environment is
 * signed in on request — which is what lets a reviewer check what a region or
 * event manager sees — and an account that could not hold a session is refused
 * rather than handed a token nobody can spend.
 *
 * ⚠ **The environment is set in `vi.hoisted`, and it has to be.**
 * `previewSignInHere()` runs when `testHelpers` constructs the plugin, so an
 * assignment in `beforeAll` would run after it, the option would silently be off,
 * and every "no token" case below would still pass.
 *
 * ⚠ **Production is asserted through `issueMagicLink` rather than a second
 * environment.** Naming this environment `production` would also switch the mail
 * adapter and the storage isolation over, which is a different suite's business;
 * the uniform answer is entirely `previewAutoSignIn` being off, so the last case
 * drives that directly.
 *
 * The sign-in form's Server Action is driven here too, because it is the half a
 * person uses — and since the picker's rows submit through it, the half a
 * reviewer uses to become another manager.
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
import { issueMagicLink } from '@/plugins/login'
import { managersLoginHere, PREVIEW_ADMIN_ADDRESS } from '@/plugins/previewAdmin'

vi.hoisted(() => {
  process.env.RAILWAY_ENVIRONMENT_NAME = 'pr-840'
})

// The action reaches for the app config with `getPayload({ config })`; point it
// at this suite's own. `cookies` and `redirect` are Next's request scope, which a
// direct call has none of — `redirect` throws, as Next's own does, so the action
// stops where it would in production.
const { configRef, cookieJar, redirectedTo, REDIRECTED } = vi.hoisted(() => ({
  configRef: { current: undefined as unknown },
  cookieJar: new Map<string, string>(),
  redirectedTo: { current: undefined as string | undefined },
  REDIRECTED: new Error('NEXT_REDIRECT'),
}))
vi.mock('@payload-config', () => ({ default: configRef.current }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: (name: string, value: string) => cookieJar.set(name, value) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    redirectedTo.current = to
    throw REDIRECTED
  },
}))

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
      email: PREVIEW_ADMIN_ADDRESS,
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
    configRef.current = payload.config
  })

  afterAll(async () => {
    await cleanup()
  })

  it('signs the preview admin in, with a session that authenticates', async () => {
    const res = await request({ email: PREVIEW_ADMIN_ADDRESS })

    expect(res.status).toBe(200)
    const token = tokenFrom(res.body)
    expect(token).toBeTruthy()
    // The cookie is the browser's half of the same session.
    expect(res.headers.get('Set-Cookie')).toBeTruthy()

    const asAdmin = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
    const me = await asAdmin('/api/managers/me')
    expect((me.body as { user?: { email?: string } }).user?.email).toBe(PREVIEW_ADMIN_ADDRESS)
  })

  it('signs in again straight away, because the throttle must not bound a test run', async () => {
    expect(tokenFrom((await request({ email: PREVIEW_ADMIN_ADDRESS })).body)).toBeTruthy()
  })

  it('takes the address as typed, whatever its case', async () => {
    const shouted = PREVIEW_ADMIN_ADDRESS.toUpperCase()

    expect(tokenFrom((await request({ email: shouted })).body)).toBeTruthy()
  })

  it('signs any other manager in too, which is how a reviewer checks their view', async () => {
    // ⚠ The behaviour this ticket is about. The address used to BE the
    // credential, so one address was signed in and every other manager stayed
    // unreachable — and the promise a change like #1073 makes, that an event's
    // own manager sees their registrants and another manager is turned away,
    // could not be checked at all.
    // ⚠ `_verified: true` is not optional: an unaccepted account gets the
    // invitation rather than a session, so the fixture has to be an account
    // that could actually hold one — which is also why the fixture the CI fill
    // seeds marks every manager accepted.
    const other = await testData.createManager(payload, {
      _verified: true,
      name: 'Region Manager',
    })

    const res = await request({ email: other.email })

    const token = tokenFrom(res.body)
    expect(token).toBeTruthy()
    const asManager = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
    const me = await asManager('/api/managers/me')
    expect((me.body as { user?: { email?: string } }).user?.email).toBe(other.email)
  })

  describe('through the sign-in form', () => {
    const submit = async (email: string, redirect?: string) => {
      const { requestSignInLinkAction } = await import('@/components/admin/SignIn/actions')
      const form = new FormData()
      form.set('email', email)
      if (redirect) form.set('redirect', redirect)
      return requestSignInLinkAction(null, form)
    }

    it('signs the preview admin in and redirects, rather than saying "check your email"', async () => {
      cookieJar.clear()

      await expect(submit(PREVIEW_ADMIN_ADDRESS)).rejects.toBe(REDIRECTED)

      const [token] = [...cookieJar.values()]
      expect(token).toBeTruthy()
      const asAdmin = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
      const me = await asAdmin('/api/managers/me')
      expect((me.body as { user?: { email?: string } }).user?.email).toBe(PREVIEW_ADMIN_ADDRESS)
    })

    it('lands on the page that sent the admin to sign in, or the dashboard', async () => {
      await expect(submit(PREVIEW_ADMIN_ADDRESS, '/admin/collections/events/3')).rejects.toBe(
        REDIRECTED,
      )
      expect(redirectedTo.current).toBe('/admin/collections/events/3')

      await expect(submit(PREVIEW_ADMIN_ADDRESS, 'https://evil.example/admin/')).rejects.toBe(
        REDIRECTED,
      )
      expect(redirectedTo.current).toBe('/admin')
    })

    it('signs another manager in and redirects, which is what a picker row does', async () => {
      const other = await testData.createManager(payload, {
        _verified: true,
        name: 'Event Manager',
      })
      cookieJar.clear()

      await expect(submit(other.email)).rejects.toBe(REDIRECTED)

      const [token] = [...cookieJar.values()]
      const asManager = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
      const me = await asManager('/api/managers/me')
      expect((me.body as { user?: { email?: string } }).user?.email).toBe(other.email)
    })
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

    expect(tokenFrom((await request({ email: PREVIEW_ADMIN_ADDRESS })).body)).toBeUndefined()

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

    expect(tokenFrom((await request({ email: PREVIEW_ADMIN_ADDRESS })).body)).toBeUndefined()
  })

  it('mints nothing with the option off, which is production, CI and local dev', async () => {
    // ⚠ The uniform answer is the whole of what keeps an anonymous endpoint
    // from being an account-enumeration oracle, and `previewAutoSignIn` being
    // off is the whole of what makes it uniform. Driven here rather than
    // through a second environment: see the file header.
    const config = { ...managersLoginHere(), previewAutoSignIn: false }

    const signedIn = await issueMagicLink({
      config,
      email: PREVIEW_ADMIN_ADDRESS,
      payload,
    })

    expect(signedIn).toBeUndefined()
  })
})
