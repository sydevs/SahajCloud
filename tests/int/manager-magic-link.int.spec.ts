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
 * all, which is the failure `manager-verification.int.spec.ts` already paid for.
 */
import type { Payload } from 'payload'

import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getServerUrl } from '@/lib/utilities/serverUrl'
import { createSession, REQUEST_LINK_THROTTLE_MS, signInviteToken } from '@/plugins/login'

import { EmailTestAdapter } from '../utils/emailTestAdapter'
import { testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const REQUEST_PATH = '/api/managers/request-link'
const CONSUME_PATH = '/api/managers/consume-link'

/** The sign-in link as the recipient receives it, token captured. */
const SIGN_IN_URL = new RegExp(
  `${getServerUrl().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/managers/consume-link\\?token=([\\w.-]+)`,
)

describe('manager magic-link sign-in', () => {
  let payload: Payload
  let config: Awaited<ReturnType<typeof createTestEnvironmentWithEmail>>['config']
  let emailAdapter: EmailTestAdapter
  let cleanup: () => Promise<void>

  /** An unauthenticated REST caller — no Authorization header, by design. */
  const anon = async (path: string, init?: { method?: string; json?: unknown }) => {
    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000${path}`, {
        method: init?.method ?? 'GET',
        headers: init?.json === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(init?.json === undefined ? {} : { body: JSON.stringify(init.json) }),
        redirect: 'manual',
      }),
    })
    return { status: response.status, headers: response.headers, raw: await response.text() }
  }

  const requestLinkFor = (email: string) =>
    anon(REQUEST_PATH, { method: 'POST', json: { email } })

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

  /** Move the outstanding stamp out of the throttle window without waiting. */
  const ageTheStamp = async (id: number | string) => {
    const manager = await payload.findByID({ collection: 'managers', id, depth: 0 })
    if (!manager.magicLinkIssuedAt) return
    await payload.update({
      collection: 'managers',
      id,
      data: {
        magicLinkIssuedAt: new Date(
          new Date(manager.magicLinkIssuedAt).getTime() - REQUEST_LINK_THROTTLE_MS - 1000,
        ).toISOString(),
      },
    })
  }

  const activeManager = (overrides: Record<string, unknown> = {}) =>
    testData.createManager(payload, { type: 'manager', _verified: true, ...overrides })

  beforeAll(async () => {
    const env = await createTestEnvironmentWithEmail()
    payload = env.payload
    config = env.config
    emailAdapter = env.emailAdapter
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the plugin wiring', () => {
    it('injects the field and appends both endpoints, leaving setProject registered', async () => {
      const managers = (await config).collections!.find((c) => c.slug === 'managers')!

      expect(managers.fields.some((f) => 'name' in f && f.name === 'magicLinkIssuedAt')).toBe(true)

      const paths = (managers.endpoints || []).map((e) => e.path)
      // `setProject` is the regression this asserts: `Managers.ts` declares
      // `endpoints: [setProject]`, and a plugin that replaced rather than
      // appended would delete the project switcher silently.
      expect(paths).toContain('/set-project')
      expect(paths).toContain('/request-link')
      expect(paths).toContain('/consume-link')
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

      const after = await payload.findByID({ collection: 'managers', id: manager.id, depth: 0 })
      expect(after.magicLinkIssuedAt).toBeTruthy()
    })

    it('sends nothing to an inactive manager, and stamps nothing', async () => {
      const inactive = await testData.createManager(payload, { type: 'inactive' })
      emailAdapter.clearCapturedEmails()

      await requestLinkFor(inactive.email)

      expect(emailAdapter.findEmailByTo(inactive.email)).toBeUndefined()
      const after = await payload.findByID({ collection: 'managers', id: inactive.id, depth: 0 })
      expect(after.magicLinkIssuedAt ?? null).toBeNull()
    })

    it('refuses a second send inside the throttle window, leaving the first link outstanding', async () => {
      const manager = await activeManager()
      await requestLinkFor(manager.email)
      const first = await payload.findByID({ collection: 'managers', id: manager.id, depth: 0 })

      emailAdapter.clearCapturedEmails()
      await requestLinkFor(manager.email)

      expect(emailAdapter.findEmailByTo(manager.email)).toBeUndefined()
      const second = await payload.findByID({ collection: 'managers', id: manager.id, depth: 0 })
      expect(second.magicLinkIssuedAt).toBe(first.magicLinkIssuedAt)
    })

    it('rejects a body that is not an email address', async () => {
      const bad = await anon(REQUEST_PATH, { method: 'POST', json: { email: 'not-an-address' } })
      expect(bad.status).toBe(400)
    })
  })

  describe('consuming a link', () => {
    it('sets a session cookie, redirects to /admin, and the cookie authenticates', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      const response = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(token)}`)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(`${getServerUrl()}/admin`)

      const cookie = response.headers.get('Set-Cookie')
      expect(cookie, 'the 302 carries no Set-Cookie — Response.redirect() would not').toBeTruthy()
      expect(cookie).toContain('HttpOnly')

      // The cookie is the whole point, so it is spent rather than inspected.
      const me = await handleEndpoints({
        config,
        request: new Request('http://localhost:3000/api/managers/me', {
          headers: { Cookie: cookie!.split(';')[0] },
        }),
      })
      const body = (await me.json()) as { user?: { id: number | string; roles?: unknown } }
      expect(body.user?.id).toBe(manager.id)
    })

    it('resolves per-locale roles after a magic-link sign-in', async () => {
      // The reason this route redirects instead of returning a user: the
      // localized-roles hooks reshape an auth RESPONSE, and `afterMe` is what
      // resolves the record. A hand-built body here would carry flat roles.
      const manager = await testData.createManager(payload, {
        type: 'manager',
        _verified: true,
        roles: { en: ['meditations-editor'], cs: ['web-translator'] },
      })
      const token = await linkTokenFor(manager.email)
      const response = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(token)}`)
      const cookie = response.headers.get('Set-Cookie')!.split(';')[0]

      const read = async (locale: string) => {
        const res = await handleEndpoints({
          config,
          request: new Request(`http://localhost:3000/api/managers/me?locale=${locale}`, {
            headers: { Cookie: cookie },
          }),
        })
        return (await res.json()) as { user?: { roles?: Record<string, string[]> } }
      }

      const en = await read('en')
      const cs = await read('cs')
      expect(en.user?.roles?.en).toEqual(['meditations-editor'])
      expect(cs.user?.roles?.cs).toEqual(['web-translator'])
    })

    it('refuses the same link a second time', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      const first = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(token)}`)
      expect(first.status).toBe(302)

      const second = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(token)}`)
      expect(second.status).toBe(400)
      expect(second.headers.get('Set-Cookie')).toBeNull()
    })

    it('a fresh request invalidates the outstanding link', async () => {
      const manager = await activeManager()
      const stale = await linkTokenFor(manager.email)

      await ageTheStamp(manager.id)
      const fresh = await linkTokenFor(manager.email)
      expect(fresh).not.toBe(stale)

      expect((await anon(`${CONSUME_PATH}?token=${encodeURIComponent(stale)}`)).status).toBe(400)
      expect((await anon(`${CONSUME_PATH}?token=${encodeURIComponent(fresh)}`)).status).toBe(302)
    })

    it('tells an expired link from a tampered one', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)
      const [header, body, signature] = token.split('.')

      const tampered = await anon(
        `${CONSUME_PATH}?token=${encodeURIComponent(`${header}.${body}.${signature.slice(0, -2)}xx`)}`,
      )
      expect(tampered.status).toBe(400)

      // An authentic token whose clock ran out. Minted 16 minutes in the past,
      // which is outside the 15-minute lifetime.
      const stamp = new Date(Date.now() - 16 * 60 * 1000)
      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { magicLinkIssuedAt: stamp.toISOString() },
      })
      const aged = await import('@/plugins/login').then(({ signSigninToken }) =>
        signSigninToken(
          { collection: 'managers', issuedAt: stamp.getTime(), userId: manager.id },
          payload.secret,
          stamp,
        ),
      )
      const expired = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(aged)}`)
      expect(expired.status).toBe(410)
    })

    it('refuses an invitation token at the sign-in route', async () => {
      const manager = await activeManager()
      await requestLinkFor(manager.email)
      const stored = await payload.findByID({ collection: 'managers', id: manager.id, depth: 0 })

      // Same claims, same instant, valid signature — only the audience differs.
      const invite = await signInviteToken(
        {
          collection: 'managers',
          issuedAt: new Date(stored.magicLinkIssuedAt!).getTime(),
          userId: manager.id,
        },
        payload.secret,
      )

      const response = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(invite)}`)
      expect(response.status).toBe(400)
      expect(response.headers.get('Set-Cookie')).toBeNull()
    })

    it('refuses a manager deactivated after the link was sent', async () => {
      const manager = await activeManager()
      const token = await linkTokenFor(manager.email)

      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { type: 'inactive' },
      })

      const response = await anon(`${CONSUME_PATH}?token=${encodeURIComponent(token)}`)
      expect(response.status).toBe(400)
      expect(response.headers.get('Set-Cookie')).toBeNull()
    })

    it('refuses a request carrying no token at all', async () => {
      expect((await anon(CONSUME_PATH)).status).toBe(400)
    })
  })
})
