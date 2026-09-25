/**
 * The manager invitation, end to end (#839).
 *
 * The sibling of `manager-magic-link.int.spec.ts`, and the same discipline: the
 * link is read out of the captured EMAIL rather than rebuilt from the token this
 * file could sign itself, so a template that embedded no link at all would fail
 * here rather than pass.
 *
 * ⚠ **What is asserted is the SEND, not the template.** `manager-invite.spec.ts`
 * covers the copy and the grant summary without a bootstrap. What only a booted
 * Payload can show is that `create` sends this and nothing else, that the
 * localized write still lands where the create asked, and that accepting flips
 * `_verified` and mints a session.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'
import { escapeRegExp } from '@/lib/eventQuality/heuristics'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { signSigninToken } from '@/plugins/login'

import { EmailTestAdapter } from '../utils/emailTestAdapter'
import { createAnonRestClient, createRestClientWithAuth, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const ACCEPT_PATH = '/api/managers/redeem-invite'
const REQUEST_PATH = '/api/managers/request-magic-link'

/**
 * The invitation as the recipient receives it, token captured.
 *
 * ⚠ **`?invite=`, not `?token=`.** The two links are separate JWT audiences, so
 * an invitation arriving under the sign-in parameter would be read with the
 * wrong reader and refused as invalid.
 */
const INVITE_URL = new RegExp(
  `${escapeRegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}?invite=`)}([\\w.%-]+)`,
)

const SIGN_IN_URL = new RegExp(
  `${escapeRegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}?token=`)}([\\w.%-]+)`,
)

describe('manager invitation', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironmentWithEmail>>
  let emailAdapter: EmailTestAdapter
  let anon: RestClient
  let cleanup: () => Promise<void>

  /** Accept an invitation the way the confirmation page's form does. */
  const accept = (token: string) =>
    anon(`${ACCEPT_PATH}?token=${encodeURIComponent(token)}`, { method: 'POST' })

  const verifiedFlag = async (id: number | string) =>
    (await payload.findByID({ collection: 'managers', id, depth: 0 }))._verified

  const tokenIn = (html: string | undefined, pattern: RegExp): null | string => {
    const match = html?.match(pattern)
    return match ? decodeURIComponent(match[1]!) : null
  }

  /** Create a manager the way the admin form does, and hand back the invitation. */
  const invite = async (overrides: Record<string, unknown> = {}) => {
    emailAdapter.clearCapturedEmails()
    const manager = await testData.createManager(payload, { type: 'manager', ...overrides })
    const sent = emailAdapter.findEmailByTo(manager.email)
    expect(sent, `no invitation captured for ${manager.email}`).toBeDefined()

    const token = tokenIn(sent!.html, INVITE_URL)
    expect(token, `no invitation link in the body:\n${sent!.html?.slice(0, 400)}`).not.toBeNull()

    return { manager, sent: sent!, token: token! }
  }

  const expectAccepted = (answer: { headers: Headers; status: number }) => {
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe(`${getServerUrl()}/admin`)
    expect(answer.headers.get('Set-Cookie')).toBeTruthy()
  }

  const expectRefused = (
    answer: { headers: Headers; status: number },
    reason: 'invalid' | 'invite-expired',
  ) => {
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe(
      `${getServerUrl()}${MANAGER_SIGNIN_PATH}?error=${reason}`,
    )
    expect(answer.headers.get('Set-Cookie')).toBeNull()
  }

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

  describe('creating a manager', () => {
    it('sends exactly one email, and it is the invitation', async () => {
      const { manager, sent } = await invite()

      const toThem = emailAdapter
        .getCapturedEmails()
        .filter((email) => JSON.stringify(email.to).includes(manager.email))
      expect(toThem).toHaveLength(1)

      expect(sent.subject).toContain('invited')
      // The route the swap replaced. It asks for a password this flow never sets.
      expect(sent.html).not.toContain('/admin/managers/verify/')
    })

    it('names the roles by label, at whichever locale the create wrote them', async () => {
      // ⚠ **A create writes ONE locale**, so that is all the invitation can
      // name — a second locale's roles are a later `update`, after this email
      // has been rendered and sent. French here rather than English precisely
      // because it proves the `locale: 'all'` read, and not a default-locale
      // one, is what produced the row. The resend below is where a manager
      // holding two locales gets both named.
      const { sent } = await invite({ roles: { fr: ['web-translator'] } })

      expect(sent.html).toContain('French')
      expect(sent.html).toContain('Web Translator')
      expect(sent.html).not.toContain('English')
    })

    it('leaves the localized write at the locale the create asked for', async () => {
      // The summary reads `locale: 'all'` from inside the create's own
      // transaction. Passing the caller's request straight through would
      // repoint it, and the roles below would land at `all` or nowhere (#609).
      const { manager } = await invite({ roles: { fr: ['web-translator'] } })

      const french = await payload.findByID({ collection: 'managers', id: manager.id, locale: 'fr' })
      expect(french.roles).toEqual(['web-translator'])

      const english = await payload.findByID({ collection: 'managers', id: manager.id, locale: 'en' })
      expect(english.roles ?? []).toEqual([])
    })

    it('sends nothing when the caller opts out — the importer’s path', async () => {
      emailAdapter.clearCapturedEmails()

      const email = `import_${Date.now()}@example.com`
      const created = await payload.create({
        collection: 'managers',
        data: { name: 'Imported', email, password: 'password123', type: 'manager' },
        disableVerificationEmail: true,
      })

      expect(emailAdapter.findEmailByTo(email)).toBeUndefined()
      // And nothing marked them accepted, so the magic link is their way in.
      expect(created._verified).toBeFalsy()
    })
  })

  describe('accepting an invitation', () => {
    it('signs the manager in and marks them verified', async () => {
      const { manager, token } = await invite()
      expect(await verifiedFlag(manager.id)).toBeFalsy()

      const response = await accept(token)
      expectAccepted(response)

      const cookie = response.headers.get('Set-Cookie')!
      const asManager = createRestClientWithAuth(env, { Cookie: cookie.split(';')[0]! })
      const me = await asManager('/api/managers/me')
      expect((me.body.user as { id: number | string } | null)?.id).toBe(manager.id)

      expect(await verifiedFlag(manager.id)).toBe(true)
    })

    it('refuses the same invitation a second time', async () => {
      const { token } = await invite()
      expectAccepted(await accept(token))

      // `_verified` is the single-use check here: an invitation minted during
      // `create` stamps no timestamp to compare against.
      expectRefused(await accept(token), 'invalid')
    })

    it('refuses a sign-in token at the invitation route', async () => {
      const { manager } = await invite()

      // Same claims, valid signature — only the audience differs.
      const signin = await signSigninToken(
        { collection: 'managers', issuedAt: Date.now(), userId: manager.id },
        payload.secret,
      )

      expectRefused(await accept(signin), 'invalid')
      expect(await verifiedFlag(manager.id)).toBeFalsy()
    })

    it('refuses a tampered invitation, and one carrying no token at all', async () => {
      const { token } = await invite()
      const [header, body, signature] = token.split('.')

      expectRefused(await accept(`${header}.${body}.${signature!.slice(0, -2)}xx`), 'invalid')
      expectRefused(await anon(ACCEPT_PATH, { method: 'POST' }), 'invalid')
    })

    it('refuses a manager deactivated after the invitation was sent', async () => {
      const { manager, token } = await invite()

      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { type: 'inactive' },
      })

      expectRefused(await accept(token), 'invalid')
      expect(await verifiedFlag(manager.id)).toBeFalsy()
    })
  })

  describe('asking for a link', () => {
    /** Ask for a link and hand back the message that arrives. */
    const request = async (email: string) => {
      emailAdapter.clearCapturedEmails()
      await anon(REQUEST_PATH, { method: 'POST', json: { email } })
      return emailAdapter.findEmailByTo(email)
    }

    it('re-sends the invitation to a manager who has never accepted', async () => {
      // The self-service rescue: an imported manager, or one whose invitation
      // was lost, has nothing else that would ever mail them.
      const { manager } = await invite()

      const sent = await request(manager.email)
      expect(sent, 'nothing was sent to an unaccepted manager').toBeDefined()
      expect(tokenIn(sent!.html, INVITE_URL)).not.toBeNull()
      expect(tokenIn(sent!.html, SIGN_IN_URL)).toBeNull()
    })

    it('names every locale once the roles exist — which a create cannot', async () => {
      // The other half of the create-writes-one-locale finding above. By the
      // time a manager asks for a link, both locales have been written.
      const { manager } = await invite({
        roles: { en: ['meditations-editor'], fr: ['web-translator'] },
      })

      const sent = await request(manager.email)
      expect(sent!.html).toContain('English')
      expect(sent!.html).toContain('Meditations Editor')
      expect(sent!.html).toContain('French')
      expect(sent!.html).toContain('Web Translator')
    })

    it('sends a plain sign-in link once they have accepted', async () => {
      const { manager, token } = await invite()
      expectAccepted(await accept(token))

      const sent = await request(manager.email)
      expect(sent, 'nothing was sent to an accepted manager').toBeDefined()
      expect(tokenIn(sent!.html, SIGN_IN_URL)).not.toBeNull()
      expect(tokenIn(sent!.html, INVITE_URL)).toBeNull()
    })

    it('carries an imported manager all the way in', async () => {
      // The importer's row, start to finish: nothing mailed it, `_verified` is
      // false, and asking for a link is what delivers the invitation that
      // accepts it.
      emailAdapter.clearCapturedEmails()
      const email = `import_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
      const created = await payload.create({
        collection: 'managers',
        data: { name: 'Imported', email, password: 'password123', type: 'manager' },
        disableVerificationEmail: true,
      })
      expect(emailAdapter.findEmailByTo(email)).toBeUndefined()

      const sent = await request(email)
      const token = tokenIn(sent?.html, INVITE_URL)
      expect(token, 'an imported manager was sent no invitation').not.toBeNull()

      expectAccepted(await accept(token!))
      expect(await verifiedFlag(created.id)).toBe(true)
    })
  })
})
