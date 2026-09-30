/**
 * The password cut-over (#840).
 *
 * `loginPlugin` sets `auth.disableLocalStrategy: { enableFields: true }` on
 * every collection it serves. Almost everything that follows from that is
 * Payload's behaviour, not ours — which is exactly why it is pinned here. A
 * framework upgrade that changed any of it would otherwise surface as managers
 * unable to sign in, on a deploy nothing failed on.
 *
 * ⚠ **The object form and the bare `true` form differ, and both are in this
 * repo.** `clients` uses bare `true`; `managers` must not, or it loses `email`,
 * `_verified` and `sessions`. The first suite below is what catches a
 * "consistency" edit that swaps one for the other.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAnonRestClient, createRestClientAs, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const LOGIN_PATH = '/api/managers/login'

describe('managers hold no password', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironment>>
  let anon: RestClient
  let cleanup: () => Promise<void>

  const hasField = (name: string) =>
    payload.collections.managers!.config.fields.some(
      (field) => 'name' in field && field.name === name,
    )

  /**
   * A manager holding a live session and nothing else — no password exists to
   * hold. `createRestClientAs` is what sets `_verified` and mints the session,
   * so these suites test the same shape of user every other suite does.
   */
  const signedIn = async () => {
    const manager = await testData.createManager(payload, {
      name: `Session ${Math.random().toString(36).slice(2)}`,
    })
    return { client: await createRestClientAs(env, manager), manager }
  }

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    anon = createAnonRestClient(env)
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the switch itself', () => {
    it('is the object form, so the columns the flow needs survive', () => {
      const auth = payload.collections.managers!.config.auth

      expect(auth.disableLocalStrategy).toEqual({ enableFields: true })

      // Each one is dropped by the bare `true` form: the address the link is
      // sent to, the accepted flag the JWT strategy gates on, and the rows
      // `createSession` mints into.
      expect(hasField('email')).toBe(true)
      expect(hasField('_verified')).toBe(true)
      expect(hasField('sessions')).toBe(true)
    })

    it('drops the account lock, which nothing could set or clear any more', () => {
      expect(payload.collections.managers!.config.auth.maxLoginAttempts).toBe(0)
      expect(hasField('loginAttempts')).toBe(false)
      expect(hasField('lockUntil')).toBe(false)
    })

    it('leaves `clients` on the bare form it needs', () => {
      expect(payload.collections.clients!.config.auth.disableLocalStrategy).toBe(true)
    })
  })

  describe('the routes Payload closes', () => {
    it('refuses a password login, whatever the password', async () => {
      const manager = await testData.createManager(payload, { name: 'No Password Login' })

      // Anonymous on purpose — this is how the internet reaches it. The 403 is
      // Payload's `Forbidden`, thrown on `login.js`'s first lines.
      const res = await anon(LOGIN_PATH, {
        method: 'POST',
        json: { email: manager.email, password: 'password123' },
      })

      expect(res.status).toBe(403)
    })

    it('refuses the reset, verify and unlock operations too', async () => {
      const manager = await testData.createManager(payload, { name: 'No Reset' })

      await expect(
        payload.forgotPassword({ collection: 'managers', data: { email: manager.email } }),
      ).rejects.toMatchObject({ name: 'Forbidden' })

      await expect(
        payload.resetPassword({
          collection: 'managers',
          data: { password: 'whatever', token: 'anything' },
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden' })

      await expect(
        payload.unlock({
          collection: 'managers',
          data: { email: manager.email } as { email: string; password: string },
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden' })
    })

    it('creates a manager with no password at all', async () => {
      const created = await testData.createManager(payload, { name: 'Created Passwordless' })

      // `create.js` skips password registration outright once the strategy is
      // off, so nothing is stored — and the admin create form loses the input
      // for the same reason, with no custom view of ours.
      const stored = await payload.findByID({
        collection: 'managers',
        id: created.id,
        depth: 0,
        showHiddenFields: true,
      })

      expect(stored.hash).toBeFalsy()
      expect(stored.salt).toBeFalsy()
    })

    it('stores no password sent on an update, either', async () => {
      // ⚠ Unlike `create`, Payload's update still hashes a `password` under
      // the object form — `update.js` saves one whenever `enableFields` is set.
      // Nothing could log in with it, but it would put back the hash the
      // `null_manager_password_hashes` migration removed. `loginPlugin` drops
      // the field before the operation reads it.
      const created = await testData.createManager(payload, { name: 'Updated Passwordless' })

      await payload.update({
        collection: 'managers',
        id: created.id,
        data: { name: 'Still Passwordless', password: 'correct horse battery staple' } as never,
      })
      const stored = await payload.findByID({
        collection: 'managers',
        id: created.id,
        depth: 0,
        showHiddenFields: true,
      })

      expect(stored.name).toBe('Still Passwordless')
      expect(stored.hash).toBeFalsy()
      expect(stored.salt).toBeFalsy()
    })
  })

  describe('the only JWT path left', () => {
    /**
     * Payload pushes `local-jwt` only for a collection whose
     * `disableLocalStrategy` is falsy (`payload/dist/index.js:434,441`), and
     * both auth collections now set it — so `accessPlugin`'s own strategy is
     * the only one that authenticates anybody.
     *
     * ⚠ It attaches only where `roles` is **localized**
     * (`localizedRolesAuth.ts`). Un-localize that field and this suite is what
     * says so, rather than a preview nobody can log in to.
     */
    it('carries a manager-capable strategy and no local-jwt', () => {
      const names = payload.authStrategies.map((strategy) => strategy.name)

      expect(names).not.toContain('local-jwt')
      expect(names).toContain('localized-roles')
    })

    it('signs a manager in with a session and no credential of theirs', async () => {
      const { client, manager } = await signedIn()

      const me = await client('/api/managers/me')
      expect((me.body as { user?: { email?: string } }).user?.email).toBe(manager.email)
    })
  })

  describe('refresh and logout, which read the option differently', () => {
    /**
     * ⚠ **`refresh.js` tests `!disableLocalStrategy` and `logout.js` tests
     * `!== true`.** An object is truthy but is not `true`, so the switch turns
     * one branch off and leaves the other on. Both are pinned because either
     * silently changing would be a session bug found in production.
     */
    const sessionsOf = async (id: number | string) => {
      const doc = await payload.findByID({ collection: 'managers', id, depth: 0 })
      return doc.sessions ?? []
    }

    it('refreshes a session, and leaves the stored row alone', async () => {
      const { client, manager } = await signedIn()
      const before = await sessionsOf(manager.id)

      const refreshed = await client('/api/managers/refresh-token', { method: 'POST' })
      expect(refreshed.status).toBe(200)
      expect((refreshed.body as { refreshedToken?: string }).refreshedToken).toBeTruthy()

      // The row is what a later `createSession` prunes against, so whether
      // refresh extends it decides how long a signed-in manager survives their
      // own next sign-in.
      expect(await sessionsOf(manager.id)).toEqual(before)
    })

    it('logs out for real — the session row goes, and the token stops working', async () => {
      const { client, manager } = await signedIn()
      expect(await sessionsOf(manager.id)).toHaveLength(1)

      expect((await client('/api/managers/logout', { method: 'POST' })).status).toBe(200)

      expect(await sessionsOf(manager.id)).toHaveLength(0)

      // The JWT strategy matches the token's `sid` against the stored rows
      // whatever `disableLocalStrategy` says, which is what makes the logout
      // final rather than cosmetic.
      const after = await client('/api/managers/me')
      expect((after.body as { user: unknown }).user).toBeNull()
    })
  })
})
