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

import { MANAGER_SIGNIN_PATH, managersLogin } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { mintSignInLink, pageLinkUrl, readSigninToken, signInviteToken } from '@/plugins/login'
import { captureFailure } from '@/plugins/sentry/captureFailure'

import { createAnonRestClient, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

// The action reaches for the app config with `getPayload({ config })`. Pointed
// at this suite's own sanitized config, it writes to this file's isolated
// schema instead of booting the real one.
const { configRef } = vi.hoisted(() => ({ configRef: { current: undefined as unknown } }))
vi.mock('@payload-config', () => ({ default: configRef.current }))

// Wrapped, not replaced: the real body still runs, so this only observes whether a site reports.
vi.mock('@/plugins/sentry/captureFailure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/plugins/sentry/captureFailure')>()
  return { ...actual, captureFailure: vi.fn(actual.captureFailure) }
})

const REQUEST_PATH = '/api/managers/request-magic-link'
const REDEEM_PATH = '/api/managers/redeem'

describe('manager sign-in page', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironmentWithEmail>>
  let emailAdapter: EmailTestAdapter
  let anon: RestClient
  let cleanup: () => Promise<void>
  let requestSignInLinkAction: (typeof import('@/components/admin/SignIn/actions'))['requestSignInLinkAction']
  let deliveredLink: (typeof import('@/components/admin/SignIn/deliveredLink'))['deliveredLink']

  /** Submit the form, as `useActionState` does — `redirect` is its hidden field. */
  const submit = (email: unknown, redirect?: string) => {
    const form = new FormData()
    if (email !== undefined) form.set('email', email as string)
    if (redirect !== undefined) form.set('redirect', redirect)
    return requestSignInLinkAction(null, form)
  }

  /** The token in the link a delivered mail carries. */
  const tokenMailedTo = (email: string) => {
    const html = emailAdapter.findEmailByTo(email)?.html ?? ''
    const match = html.match(/[?&]token=([\w.%-]+)/)
    expect(match, `no sign-in link mailed to ${email}`).not.toBeNull()
    return decodeURIComponent(match![1])
  }

  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!

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
    ;({ requestSignInLinkAction } = await import('@/components/admin/SignIn/actions'))
    ;({ deliveredLink } = await import('@/components/admin/SignIn/deliveredLink'))
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

  describe('the page that sent the reader to sign in', () => {
    it('rides the form into the emailed link', async () => {
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()

      await submit(manager.email, '/admin/collections/events/3?locale=fr')

      const read = await readSigninToken(tokenMailedTo(manager.email), payload.secret)
      expect(read.status === 'valid' && read.claims.to).toBe(
        '/admin/collections/events/3?locale=fr',
      )
    })

    it('is dropped, not refused, when malformed — the answer and the send are unchanged', async () => {
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()

      const answer = await anon(REQUEST_PATH, {
        method: 'POST',
        json: { email: manager.email, redirect: 42 },
      })

      expect(answer.status).toBe(200)
      expect(answer.body).toEqual({ ok: true })
      const read = await readSigninToken(tokenMailedTo(manager.email), payload.secret)
      expect(read.status === 'valid' && read.claims.to).toBeUndefined()
    })
  })

  describe('the confirmation a delivered link opens', () => {
    it('names the account a sign-in link signs in, once', async () => {
      const manager = await activeManager({ name: 'Jane Doe' })
      const token = tokenOf(
        await mintSignInLink({ config: managersLogin, id: manager.id, payload }),
      )

      expect(await deliveredLink(token, payload)).toMatchObject({
        email: manager.email,
        heading: 'Sign in as Jane Doe',
        detail: manager.email,
        submitLabel: 'Continue',
      })
    })

    it('welcomes an invited account, and names the page a reminder opens', async () => {
      const manager = await testData.createManager(payload, { name: 'Jane Doe' })
      const now = new Date()
      const claims = { collection: 'managers', issuedAt: now.getTime(), userId: manager.id }
      const invite = await signInviteToken(claims, payload.secret, now)
      const link = await pageLinkUrl(
        managersLogin,
        manager.id,
        { label: 'Spring retreat', to: '/admin/collections/events/7' },
        payload.secret,
      )

      expect(await deliveredLink(invite, payload)).toMatchObject({
        heading: 'Welcome, Jane Doe',
        submitLabel: 'Activate account',
      })
      expect(await deliveredLink(tokenOf(link), payload)).toMatchObject({
        heading: 'Sign in as Jane Doe',
        detail: `${manager.email} · opens “Spring retreat”`,
      })
    })

    it('refuses an already-accepted invitation before the click', async () => {
      const manager = await activeManager({ name: 'Jane Doe' })
      const now = new Date()
      const invite = await signInviteToken(
        { collection: 'managers', issuedAt: now.getTime(), userId: manager.id },
        payload.secret,
        now,
      )

      expect(await deliveredLink(invite, payload)).toMatchObject({
        title: 'Your email is already confirmed',
      })
    })

    it('refuses a link to a deactivated or deleted account before the click', async () => {
      const deactivated = await activeManager()
      const deleted = await activeManager()
      const links = await Promise.all(
        [deactivated, deleted].map(({ id }) =>
          mintSignInLink({ config: managersLogin, id, payload }),
        ),
      )
      await payload.update({
        collection: 'managers',
        id: deactivated.id,
        data: { type: 'inactive' },
      })
      await payload.delete({ collection: 'managers', id: deleted.id })

      for (const link of links) {
        expect(await deliveredLink(tokenOf(link), payload)).toMatchObject({
          title: 'This link is not valid',
        })
      }
    })

    it('writes nothing, so a mail scanner opening the link spends nothing', async () => {
      const manager = await activeManager()
      const token = tokenOf(
        await mintSignInLink({ config: managersLogin, id: manager.id, payload }),
      )
      const before = await stampOf(manager.id)

      await deliveredLink(token, payload)

      expect(await stampOf(manager.id)).toBe(before)
    })
  })

  describe('a link that could not be sent', () => {
    // Both callers answer uniformly whatever happens, so nothing downstream can report a failed
    // send — each reports it itself (#1039).
    it.each([
      ['the page', (email: string) => submit(email)],
      ['the endpoint', (email: string) => anon(REQUEST_PATH, { method: 'POST', json: { email } })],
    ])('is reported once by %s', async (_, send) => {
      const manager = await activeManager()
      const sendEmail = vi.spyOn(payload, 'sendEmail').mockRejectedValueOnce(new Error('smtp down'))
      vi.mocked(captureFailure).mockClear()

      try {
        await send(manager.email)
      } finally {
        sendEmail.mockRestore()
      }

      expect(vi.mocked(captureFailure).mock.calls.map(([args]) => args.source)).toEqual(['signIn'])
    })
  })

  describe('the retry path out of a refusal', () => {
    // Every refusal lands back on this page, which states what happened and
    // already carries the form that fixes it. A dead end that says "request a
    // new sign-in link" is the failure the 404 was rejected for.
    const refusedTo = (reason: string) => `${getServerUrl()}${MANAGER_SIGNIN_PATH}?error=${reason}`

    it('sends an unreadable link back to this page, and serves no GET at all', async () => {
      const visited = await anon(`${REDEEM_PATH}?token=rubbish`)
      const posted = await anon(`${REDEEM_PATH}?token=rubbish`, { method: 'POST' })

      // ⚠ The absence is the assertion. The emailed link addresses this page, so
      // the redeem path answers one method — and a mail scanner's GET reaches no
      // handler here to spend anything. 403 rather than 404 because Payload then
      // tries the collection's `findByID` route with `redeem` as the
      // id and refuses the anonymous read.
      expect(visited.status).toBe(403)

      expect(posted.status).toBe(302)
      expect(posted.headers.get('Location')).toBe(refusedTo('invalid'))
      expect(posted.headers.get('Set-Cookie')).toBeNull()
    })

    it('keeps the expiry distinction on the way back', async () => {
      const manager = await activeManager()
      const { signSigninToken } = await import('@/plugins/login')
      const stale = new Date(Date.now() - 60 * 60 * 1000)
      const token = await signSigninToken(
        { collection: 'managers', issuedAt: stale.getTime(), userId: manager.id },
        payload.secret,
        stale,
      )

      const answer = await anon(`${REDEEM_PATH}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      })

      expect(answer.status).toBe(302)
      expect(answer.headers.get('Location')).toBe(refusedTo('expired'))
    })
  })

  describe('the admin login view', () => {
    it('is this page', () => {
      // Only that it is wired: the suite's config declares none of the other
      // component slots, so "every existing entry survives" cannot be seen
      // from here. `tests/unit/login-plugin.spec.ts` folds a config that has
      // them and asserts the spread against its real defect.
      // Every emailed link addresses `MANAGER_SIGNIN_PATH`, so it must be the
      // route the view is served on — a config that moved either half would mail
      // links to a page that ignores them.
      const { admin, routes } = payload.config
      expect(MANAGER_SIGNIN_PATH).toBe(`${routes.admin}${admin.routes.login}`)
      expect(payload.config.admin.components.views?.login).toEqual({
        Component: '@/components/admin/SignIn',
      })
    })
  })
})
