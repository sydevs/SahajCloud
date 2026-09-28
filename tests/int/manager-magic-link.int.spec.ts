/**
 * The passwordless sign-in loop, end to end (#837).
 *
 * Driven through `handleEndpoints` — Payload's real REST entry point —
 * **anonymously**, because both endpoints are anonymous by necessity: a manager
 * who cannot sign in is exactly who calls them. That is also why the assertions
 * below are as much about what the responses do *not* reveal as about what they
 * do.
 *
 * The token is read out of the captured EMAIL, not rebuilt from the stored
 * timestamp. Rebuilding it would pass even if the template embedded no link at
 * all, which is the failure the old `manager-verification.int.spec.ts` paid for
 * and `manager-invite.int.spec.ts` now carries.
 *
 * ⚠ **`activeManager()` is `_verified: true` on purpose, and every test that
 * asks for a LINK uses it.** An unaccepted manager is sent their invitation
 * instead (#839), so a request-link test built on a bare
 * `testData.createManager` would exercise `manager-invite.int.spec.ts`'s flow
 * while looking like this one. The bare fixtures below are the tests that never
 * reach that branch — an ineligible manager is refused before it, and the last
 * test mints its token directly.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'
import { escapeRegExp } from '@/lib/eventQuality/heuristics'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import {
  createSession,
  REQUEST_LINK_THROTTLE_MS,
  signInviteToken,
  signSigninToken,
} from '@/plugins/login'

import { EmailTestAdapter } from '../utils/emailTestAdapter'
import { createAnonRestClient, createRestClientWithAuth, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const REQUEST_PATH = '/api/managers/request-magic-link'
const REDEEM_PATH = '/api/managers/redeem-magic-link'

/**
 * The sign-in link as the recipient receives it, token captured.
 *
 * ⚠ **It addresses the page, not the endpoint.** That is what lets a mail
 * scanner's GET be answered by something that writes nothing.
 */
const SIGN_IN_URL = new RegExp(
  `${escapeRegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}?token=`)}([\\w.%-]+)`,
)

describe('manager magic-link sign-in', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironmentWithEmail>>
  let emailAdapter: EmailTestAdapter
  let anon: RestClient
  let cleanup: () => Promise<void>

  const requestLinkFor = (email: string) =>
    anon(REQUEST_PATH, { method: 'POST', json: { email } })

  /** Open the redeem path the way a mail scanner does: a bare GET, no click. */
  const scan = (token: string) => anon(`${REDEEM_PATH}?token=${encodeURIComponent(token)}`)

  /** Submit the confirmation page's form — the only thing that spends a link. */
  const consume = (token: string) =>
    anon(`${REDEEM_PATH}?token=${encodeURIComponent(token)}`, { method: 'POST' })

  /** Ask for a link and hand back the token from the email that arrives. */
  const linkTokenFor = async (email: string): Promise<string> => {
    emailAdapter.clearCapturedEmails()
    await requestLinkFor(email)
    const sent = emailAdapter.findEmailByTo(email)
    expect(sent, `no sign-in email captured for ${email}`).toBeDefined()
    const match = sent!.html?.match(SIGN_IN_URL)
    expect(match, `no sign-in link in the body:\n${sent!.html?.slice(0, 400)}`).not.toBeNull()
    return decodeURIComponent(match![1])
  }

  /**
   * ⚠ **Success and refusal are both a 302 now**, so a bare status assertion
   * tells them apart no longer. Every arm below asserts where it went.
   */
  const expectSignedIn = (answer: { headers: Headers; status: number }) => {
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe(`${getServerUrl()}/admin`)
    expect(answer.headers.get('Set-Cookie')).toBeTruthy()
  }

  const expectRefused = (
    answer: { headers: Headers; status: number },
    reason: 'expired' | 'invalid',
  ) => {
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe(
      `${getServerUrl()}${MANAGER_SIGNIN_PATH}?error=${reason}`,
    )
    expect(answer.headers.get('Set-Cookie')).toBeNull()
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
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the plugin wiring', () => {
    it('injects the field and appends both endpoints, leaving setProject registered', async () => {
      const managers = (await env.config).collections!.find((c) => c.slug === 'managers')!

      expect(managers.fields.some((f) => 'name' in f && f.name === 'magicLinkIssuedAt')).toBe(true)

      const paths = (managers.endpoints || []).map((e) => e.path)
      // `setProject` is the regression this asserts: `Managers.ts` declares
      // `endpoints: [setProject]`, and a plugin that replaced rather than
      // appended would delete the project switcher silently.
      expect(paths).toContain('/set-project')
      expect(paths).toContain('/request-magic-link')
      expect(paths).toContain('/redeem-magic-link')
      // The invitation's own route — a separate audience (#839).
      expect(paths).toContain('/redeem-invite')
    })

    it('refuses a sign-in link token presented as a session cookie', async () => {
      // Both token families are signed with `payload.secret`, and
      // `JWTAuthentication` pins neither an algorithm nor an audience — it
      // accepts any HS256 token under that key. Two independent things refuse
      // this one: the claim shape (`userId`, not `id`) and the missing `sid`
      // that `useSessions` requires. Measured — adding an `id` claim alone
      // does not flip this, the session check still holds. So this pins the
      // property, not either mechanism. It is not vacuous: the cookie case
      // above reaches `user.id` through this same client and read path.
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      const asToken = createRestClientWithAuth(env, { Authorization: `JWT ${token}` })
      const me = await asToken('/api/managers/me')
      expect(me.body.user ?? null).toBeNull()
    })

    it('refuses a manager update that writes magicLinkIssuedAt by hand', async () => {
      // Self-access grants update on one's own document, so the field's
      // `update: () => false` is the only thing stopping a manager re-arming
      // or burning their own link — or throttling themselves forever.
      const manager = await activeManager()
      await requestLinkFor(manager.email)
      const before = await stampOf(manager.id)

      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { magicLinkIssuedAt: new Date(Date.now() + 86_400_000).toISOString() },
        overrideAccess: false,
        user: { ...manager, collection: 'managers' },
      })

      expect(await stampOf(manager.id)).toBe(before)
    })

    it('refuses to mint a session for a collection carrying no sessions field', async () => {
      // `clients` sets `disableLocalStrategy`, so Payload adds neither
      // `sessions` nor `email` — a token minted for it would authenticate
      // nothing while looking well-formed.
      await expect(createSession(payload, 'clients', 1)).rejects.toThrow(/cannot hold a session/)
    })
  })

  describe('requesting a link', () => {
    it('answers identically for a link sent, an unknown address, an inactive manager and a throttled repeat', async () => {
      const active = await activeManager()
      const inactive = await testData.createManager(payload, { type: 'inactive' })

      const sent = await requestLinkFor(active.email)
      // Immediately again, inside the 60-second window.
      const throttled = await requestLinkFor(active.email)
      const unknown = await requestLinkFor(`nobody_${Date.now()}@example.com`)
      const deactivated = await requestLinkFor(inactive.email)

      for (const answer of [throttled, unknown, deactivated]) {
        expect(answer.status).toBe(sent.status)
        expect(answer.raw).toBe(sent.raw)
      }
      expect(sent.status).toBe(200)
    })

    it('sends to an active manager and stamps the instant it signed', async () => {
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()

      await requestLinkFor(manager.email)

      const sent = emailAdapter.findEmailByTo(manager.email)
      expect(sent).toBeDefined()
      expect(sent!.subject).toContain('sign-in link')
      expect(await stampOf(manager.id)).toBeTruthy()
    })

    it('sends nothing to an inactive manager, and stamps nothing', async () => {
      const inactive = await testData.createManager(payload, { type: 'inactive' })
      emailAdapter.clearCapturedEmails()

      await requestLinkFor(inactive.email)

      expect(emailAdapter.findEmailByTo(inactive.email)).toBeUndefined()
      expect((await stampOf(inactive.id)) ?? null).toBeNull()
    })

    it('refuses a second send inside the throttle window, leaving the first link outstanding', async () => {
      const manager = await activeManager()
      await requestLinkFor(manager.email)
      const first = await stampOf(manager.id)

      emailAdapter.clearCapturedEmails()
      await requestLinkFor(manager.email)

      expect(emailAdapter.findEmailByTo(manager.email)).toBeUndefined()
      expect(await stampOf(manager.id)).toBe(first)
    })

    it('finds a manager whose address was typed in a different case', async () => {
      // Payload's own `email` base field lowercases on write, so the stored
      // column never matches what a manager types in their address book's case.
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()

      await requestLinkFor(manager.email.toUpperCase())

      expect(emailAdapter.findEmailByTo(manager.email)).toBeDefined()
    })

    it('rejects a body that is not an email address', async () => {
      const bad = await anon(REQUEST_PATH, { method: 'POST', json: { email: 'not-an-address' } })
      expect(bad.status).toBe(400)
    })
  })

  describe('consuming a link', () => {
    it('sets a session cookie, redirects to /admin, and the cookie authenticates', async () => {
      const manager = await activeManager()
      const response = await consume(await linkTokenFor(manager.email))

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(`${getServerUrl()}/admin`)

      const cookie = response.headers.get('Set-Cookie')
      expect(cookie, 'the 302 carries no Set-Cookie — Response.redirect() would not').toBeTruthy()
      expect(cookie).toContain('HttpOnly')

      // The cookie is the whole point, so it is spent rather than inspected.
      const asManager = createRestClientWithAuth(env, { Cookie: cookie!.split(';')[0] })
      const me = await asManager('/api/managers/me')
      expect((me.body.user as { id: number | string }).id).toBe(manager.id)
    })

    it('resolves per-locale roles after a magic-link sign-in', async () => {
      // The reason this route redirects instead of returning a user: the
      // localized-roles hooks reshape an auth RESPONSE, and `afterMe` is what
      // resolves the record. A hand-built body here would carry flat roles.
      const manager = await activeManager({
        roles: { en: ['meditations-editor'], cs: ['web-translator'] },
      })
      const response = await consume(await linkTokenFor(manager.email))
      const asManager = createRestClientWithAuth(env, {
        Cookie: response.headers.get('Set-Cookie')!.split(';')[0],
      })

      const rolesAt = async (locale: string) => {
        const me = await asManager(`/api/managers/me?locale=${locale}`)
        return (me.body.user as { roles?: Record<string, string[]> }).roles
      }

      expect((await rolesAt('en'))?.en).toEqual(['meditations-editor'])
      expect((await rolesAt('cs'))?.cs).toEqual(['web-translator'])
    })

    it('refuses the same link a second time', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      expectSignedIn(await consume(token))

      expectRefused(await consume(token), 'invalid')
    })

    it('a fresh request invalidates the outstanding link', async () => {
      const manager = await activeManager()
      const stale = await linkTokenFor(manager.email)

      // Move the stamp out of the throttle window, so a second send happens
      // without a 60-second wait.
      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: {
          magicLinkIssuedAt: new Date(
            new Date((await stampOf(manager.id))!).getTime() - REQUEST_LINK_THROTTLE_MS - 1000,
          ).toISOString(),
        },
      })

      const fresh = await linkTokenFor(manager.email)
      expect(fresh).not.toBe(stale)

      expectRefused(await consume(stale), 'invalid')
      expectSignedIn(await consume(fresh))
    })

    it('tells an expired link from a tampered one', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)
      const [header, body, signature] = token.split('.')

      expectRefused(await consume(`${header}.${body}.${signature.slice(0, -2)}xx`), 'invalid')

      // An authentic token whose clock ran out — minted 16 minutes in the past,
      // outside the 15-minute lifetime, and matching the stored stamp so that
      // the expiry is the only thing left to refuse it.
      const stamp = new Date(Date.now() - 16 * 60 * 1000)
      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { magicLinkIssuedAt: stamp.toISOString() },
      })
      const aged = await signSigninToken(
        { collection: 'managers', issuedAt: stamp.getTime(), userId: manager.id },
        payload.secret,
        stamp,
      )
      expectRefused(await consume(aged), 'expired')
    })

    it('refuses an invitation token at the sign-in route', async () => {
      const manager = await activeManager()
      await requestLinkFor(manager.email)

      // Same claims, same instant, valid signature — only the audience differs.
      const invite = await signInviteToken(
        {
          collection: 'managers',
          issuedAt: new Date((await stampOf(manager.id))!).getTime(),
          userId: manager.id,
        },
        payload.secret,
      )

      expectRefused(await consume(invite), 'invalid')
    })

    it('refuses a manager deactivated after the link was sent', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { type: 'inactive' },
      })

      expectRefused(await consume(token), 'invalid')
    })

    it('signs in a manager who was never verified, and verifies them', async () => {
      // `Managers.auth.verify` is configured, so the JWT strategy yields no user
      // while `_verified` is false — the link would be spent on a cookie that
      // authenticates nobody, and the throttle would refuse the obvious retry.
      const manager = await testData.createManager(payload, { type: 'manager' })
      const before = await payload.findByID({ collection: 'managers', id: manager.id })
      expect(before._verified, 'the fixture is already verified — this proves nothing').toBeFalsy()

      // ⚠ Minted here rather than requested. An unaccepted manager who ASKS for
      // a link is sent their invitation instead (#839), so a sign-in token for
      // one is only reachable from a link issued before the flag was cleared —
      // which this route must still honour.
      const stamp = new Date()
      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { magicLinkIssuedAt: stamp.toISOString() },
      })
      const token = await signSigninToken(
        { collection: 'managers', issuedAt: stamp.getTime(), userId: manager.id },
        payload.secret,
        stamp,
      )

      const response = await consume(token)
      expect(response.status).toBe(302)

      const cookie = response.headers.get('Set-Cookie')
      const asManager = createRestClientWithAuth(env, { Cookie: cookie!.split(';')[0] })
      const me = await asManager('/api/managers/me')
      expect((me.body.user as { id: number | string } | null)?.id).toBe(manager.id)

      const after = await payload.findByID({ collection: 'managers', id: manager.id })
      expect(after._verified).toBe(true)
    })

    it('refuses a request carrying no token at all', async () => {
      expectRefused(await anon(REDEEM_PATH, { method: 'POST' }), 'invalid')
    })

    it('survives a mail scanner opening the link first', async () => {
      // Defender Safe Links and Proofpoint GET every URL in an inbound message
      // before the recipient sees it. A GET that burned the link would spend the
      // manager's one use, and the 60-second throttle would then refuse the
      // obvious retry.
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      // ⚠ Two halves, and both are the defence. The emailed URL is the page, so
      // what a scanner fetches writes nothing; and this path answers no GET, so
      // a scanner that reached it anyway still spends nothing.
      // 403, not 404: with no `get` handler here, Payload tries the collection's
      // `findByID` route with `redeem-magic-link` as the id and refuses the
      // anonymous read. Either status says the same thing — nothing answered.
      const scanned = await scan(token)
      expect(scanned.status).toBe(403)
      expect(scanned.headers.get('Set-Cookie')).toBeNull()
      expect(await stampOf(manager.id), 'the GET burned the link').toBeTruthy()

      // Scanners do not submit forms. The recipient does, and it still works.
      expectSignedIn(await consume(token))
    })

    it('addresses the delivered link at the page, never at this endpoint', async () => {
      // The whole scanner defence rests on which URL is in the mail, and nothing
      // but this asserts it: a link pointing back at the endpoint would restore
      // the hazard while every assertion above still passed.
      const manager = await activeManager()
      emailAdapter.clearCapturedEmails()
      await requestLinkFor(manager.email)
      const html = emailAdapter.findEmailByTo(manager.email)!.html!

      expect(html).toContain(`${getServerUrl()}${MANAGER_SIGNIN_PATH}?token=`)
      expect(html).not.toContain(REDEEM_PATH)
    })
  })
})
