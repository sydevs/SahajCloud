/**
 * The logged-out manager sign-in page (#838).
 *
 * The Server Action is driven directly, the way `session-reminders` drives the
 * unsubscribe action — there is no HTTP route to call, and a rendered form
 * would only re-test React.
 *
 * What is actually under test is that the page did **not** re-implement the
 * request endpoint. The throttle it shares is the only in-app bound on
 * per-account link volume, so the assertions that matter here cross the two
 * callers: a link issued through the endpoint must throttle the action, and the
 * reverse.
 */
import type { EmailTestAdapter } from '../utils/emailTestAdapter'
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'

import { createAnonRestClient, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

// The action reaches for the app config with `getPayload({ config })`. Pointed
// at this suite's own sanitized config, it writes to this file's isolated
// schema instead of booting the real one.
const { configRef } = vi.hoisted(() => ({ configRef: { current: undefined as unknown } }))
vi.mock('@payload-config', () => ({ default: configRef.current }))

const REQUEST_PATH = '/api/managers/request-magic-link'
const REDEEM_PATH = '/api/managers/redeem-magic-link'

describe('manager sign-in page', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironmentWithEmail>>
  let emailAdapter: EmailTestAdapter
  let anon: RestClient
  let cleanup: () => Promise<void>
  let requestSignInLinkAction: (typeof import('@/app/(frontend)/managers/signin/actions'))['requestSignInLinkAction']

  /** Submit the form, as `useActionState` does. */
  const submit = (email: unknown) => {
    const form = new FormData()
    if (email !== undefined) form.set('email', email as string)
    return requestSignInLinkAction(null, form)
  }

  const activeManager = (overrides: Record<string, unknown> = {}) =>
    testData.createManager(payload, { type: 'manager', _verified: true, ...overrides })

  const stampOf = async (id: number | string) =>
    (await payload.findByID({ collection: 'managers', id, depth: 0 })).magicLinkIssuedAt

  beforeAll(async () => {
    env = await createTestEnvironmentWithEmail()
    payload = env.payload
    emailAdapter = env.emailAdapter
    cleanup = env.cleanup
    anon = createAnonRestClient(env)

    configRef.current = payload.config
    ;({ requestSignInLinkAction } = await import('@/app/(frontend)/managers/signin/actions'))
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the answer it gives', () => {
    it('is identical for a known address, an unknown one, an inactive manager and a throttled repeat', async () => {
      const active = await activeManager()
      const inactive = await testData.createManager(payload, { type: 'inactive' })

      const sent = await submit(active.email)
      // Immediately again, inside the 60-second window.
      const throttled = await submit(active.email)
      const unknown = await submit(`nobody_${Date.now()}@example.com`)
      const deactivated = await submit(inactive.email)

      for (const answer of [throttled, unknown, deactivated]) {
        expect(answer).toEqual(sent)
      }
      expect(sent.tone).toBe('success')
    })

    it('is not uniform because nothing ever happens — a real address gets mail', async () => {
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()

      const answer = await submit(manager.email)

      expect(emailAdapter.findEmailByTo(manager.email)).toBeDefined()
      expect(await stampOf(manager.id)).toBeTruthy()
      expect(answer.tone).toBe('success')
    })

    it('sends nothing to an inactive manager, and stamps nothing', async () => {
      const inactive = await testData.createManager(payload, { type: 'inactive' })
      emailAdapter.clearCapturedEmails()

      await submit(inactive.email)

      expect(emailAdapter.findEmailByTo(inactive.email)).toBeUndefined()
      expect((await stampOf(inactive.id)) ?? null).toBeNull()
    })

    it('rejects a malformed address, which reads the typed string and no account', async () => {
      const answer = await submit('not-an-address')

      expect(answer.tone).toBe('error')
      // Distinguishable from the uniform answer on purpose: it says nothing
      // about any account, so it is no oracle.
      expect(answer).not.toEqual(await submit(`nobody_${Date.now()}@example.com`))
    })

    it('finds a manager whose address was typed in a different case', async () => {
      // Payload's `email` base field lowercases on write, so the stored column
      // never matches an address book's casing. The shared schema normalises
      // it; a second spelling here would miss, and the uniform answer would
      // hide the miss.
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()

      await submit(manager.email.toUpperCase())

      expect(emailAdapter.findEmailByTo(manager.email)).toBeDefined()
    })
  })

  describe('one implementation, two callers', () => {
    it('is throttled by a link the endpoint issued', async () => {
      const manager = await activeManager()
      await anon(REQUEST_PATH, { method: 'POST', json: { email: manager.email } })
      const first = await stampOf(manager.id)

      emailAdapter.clearCapturedEmails()
      await submit(manager.email)

      expect(emailAdapter.findEmailByTo(manager.email)).toBeUndefined()
      expect(await stampOf(manager.id)).toBe(first)
    })

    it('throttles the endpoint with a link it issued itself', async () => {
      const manager = await activeManager()
      await submit(manager.email)
      const first = await stampOf(manager.id)

      emailAdapter.clearCapturedEmails()
      await anon(REQUEST_PATH, { method: 'POST', json: { email: manager.email } })

      expect(emailAdapter.findEmailByTo(manager.email)).toBeUndefined()
      expect(await stampOf(manager.id)).toBe(first)
    })
  })

  describe('the retry path out of a refusal', () => {
    // Every refusal tells the reader to request a new link. Before this page
    // existed there was nowhere to send them, and a dead end that says
    // "request a new sign-in link" is the failure the 404 was rejected for.
    it('offers the sign-in page on an unreadable link, on both methods', async () => {
      const visited = await anon(`${REDEEM_PATH}?token=rubbish`)
      const posted = await anon(`${REDEEM_PATH}?token=rubbish`, { method: 'POST' })

      for (const answer of [visited, posted]) {
        expect(answer.status).toBe(400)
        expect(answer.raw).toContain(MANAGER_SIGNIN_PATH)
        expect(answer.raw).toContain('Request a new link')
      }
    })

    it('offers it on an expired link too, without losing the expiry distinction', async () => {
      const manager = await activeManager()
      const { signSigninToken } = await import('@/plugins/login')
      const stale = new Date(Date.now() - 60 * 60 * 1000)
      const token = await signSigninToken(
        { collection: 'managers', issuedAt: stale.getTime(), userId: manager.id },
        payload.secret,
        stale,
      )

      const answer = await anon(`${REDEEM_PATH}?token=${encodeURIComponent(token)}`)

      expect(answer.status).toBe(410)
      expect(answer.raw).toContain('expired')
      expect(answer.raw).toContain(MANAGER_SIGNIN_PATH)
    })
  })

  describe('the control on the admin login form', () => {
    it('is registered, and points at this page', () => {
      // Only that it is wired: the suite's config declares none of the other
      // component slots, so "every existing entry survives" cannot be seen
      // from here. `tests/unit/login-plugin.spec.ts` folds a config that has
      // them and asserts the spread against its real defect.
      const components = payload.config.admin.components

      expect(JSON.stringify(components.afterLogin)).toContain('RequestSignInLink')
      expect(JSON.stringify(components.afterLogin)).toContain(MANAGER_SIGNIN_PATH)
    })
  })
})
