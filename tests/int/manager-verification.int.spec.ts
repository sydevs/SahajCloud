/**
 * Integration coverage for the manager email-verification loop (#320).
 *
 * The unit sibling (`tests/unit/manager-auth-urls.spec.ts`) pins the URL the
 * config builds. This spec asks the question a pure test cannot: does the whole
 * loop actually close — is the message sent, is the token in it usable, does
 * `_verified` flip, and does login stop refusing?
 *
 * The token is extracted from the EMAIL rather than read off the row, so the
 * assertion covers the link a recipient really receives. Reading
 * `_verificationToken` from the database instead would pass even if the
 * template embedded no token at all.
 *
 * ⚠ `vi.spyOn(payload, 'sendEmail')` does NOT see auth mail. Payload's
 * `create` passes `email: payload.email` and `sendVerificationEmail` calls
 * `email.sendEmail(...)`, while `payload.sendEmail` is a separate wrapper that
 * captured the adapter method by value at init. Hence the capturing adapter.
 */
import type { Payload, PayloadRequest } from 'payload'

import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'

import { Managers } from '@/collections'
import { resendVerification } from '@/collections/Managers/endpoints/resendVerification'
import { getServerUrl } from '@/lib/utilities/serverUrl'

import { EmailTestAdapter } from '../utils/emailTestAdapter'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const PASSWORD = 'password123'

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The verify link as the recipient receives it — origin, admin route, slug, then the token. */
const VERIFY_URL = new RegExp(
  `${escapeRegExp(`${getServerUrl()}/admin/${Managers.slug}/verify/`)}([A-Za-z0-9]+)`,
)

describe('manager email verification', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let emailAdapter: EmailTestAdapter

  beforeAll(async () => {
    const testEnv = await createTestEnvironmentWithEmail()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    emailAdapter = testEnv.emailAdapter
  })

  afterAll(async () => {
    await cleanup()
  })

  it('sends a verification email whose link verifies the manager and unblocks login', async () => {
    const email = `verify_${Date.now()}@example.com`
    emailAdapter.clearCapturedEmails()

    const manager = await payload.create({
      collection: 'managers',
      data: { name: 'Jo Verifier', email, password: PASSWORD, type: 'manager', roles: [] },
    })

    // 1. The message reached that address, and it is the verification one.
    const sent = emailAdapter.findEmailByTo(email)
    expect(sent, `no email captured for ${email}`).toBeDefined()
    expect(sent!.subject).toContain('Verify Your Email')

    // 2. The link in it matches Payload's `/:collectionSlug/verify/:token` route.
    //    A two-segment `/admin/verify/:token` reaches no view and, because
    //    `isPublicAdminRoute` waves it past the auth gate, silently redirects a
    //    logged-out recipient to the login form.
    const match = sent!.html?.match(VERIFY_URL)
    expect(match, `no routable verify link in the email body:\n${sent!.html?.slice(0, 400)}`)
      .not.toBeNull()
    const token = match![1]

    // 3. Before verifying, login is refused for being unverified — not for a
    //    bad password. Asserting the ERROR NAME matters: a wrong password would
    //    also throw here, and would make step 5 look like a pass for free.
    await expect(
      payload.login({ collection: 'managers', data: { email, password: PASSWORD } }),
    ).rejects.toMatchObject({ name: 'UnverifiedEmail' })

    // 4. The token from the email verifies the account.
    await expect(payload.verifyEmail({ collection: 'managers', token })).resolves.toBe(true)

    const verified = await payload.findByID({
      collection: 'managers',
      id: manager.id,
      showHiddenFields: true,
    })
    expect(verified._verified).toBe(true)

    // 5. …and login now succeeds, which is the outcome the ticket was filed for.
    const result = await payload.login({
      collection: 'managers',
      data: { email, password: PASSWORD },
    })
    expect(result.user?.email).toBe(email)
  })

  /**
   * The rescue path for a first email that never arrived (#680). Payload ships no
   * resend operation, so before this the only fix was setting `_verified` by hand
   * in the database — which skips verification rather than performing it.
   *
   * ⚠ **Fixture assumption, verified rather than assumed:** these cases assume the
   * test Payload carries the REAL `Managers.auth.verify.generateEmailHTML`, since
   * "the resend renders the same email the create path does" is the property under
   * test and a stubbed template would make it vacuous. Checked in
   * `tests/utils/testHelpers.ts:53-65` — `getTestCollections()` maps over the real
   * `collections` export and only rewrites `upload` on `UPLOAD_COLLECTIONS`, which
   * `managers` is not, so the collection reaches the test config untouched.
   */
  describe('resending a verification email', () => {
    const ADMIN = { id: 1, collection: 'managers', type: 'admin' }

    const call = async (id: number | string, user: unknown = ADMIN) => {
      const response = (await resendVerification.handler({
        payload,
        query: {},
        headers: new Headers(),
        routeParams: { id: String(id) },
        context: {},
        user,
      } as unknown as PayloadRequest)) as Response
      return { status: response.status, body: await response.json() }
    }

    /** The body with every verify token blanked — what must match between two sends. */
    const withoutToken = (html: string) =>
      html.replace(new RegExp(VERIFY_URL.source, 'g'), (_match, token: string) =>
        _match.replace(token, 'TOKEN'),
      )

    const createUnverified = async (label: string) => {
      const email = `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`
      emailAdapter.clearCapturedEmails()
      const manager = await payload.create({
        collection: 'managers',
        data: { name: 'Ada Resend', email, password: PASSWORD, type: 'manager', roles: [] },
      })
      const first = emailAdapter.findEmailByTo(email)
      expect(first, `no create-path email captured for ${email}`).toBeDefined()
      return { email, manager, first: first! }
    }

    it('mints a new working token, revokes the previous one, and unblocks login', async () => {
      const { email, first } = await createUnverified('resend')
      const firstToken = first.html!.match(VERIFY_URL)![1]

      emailAdapter.clearCapturedEmails()
      const { status, body } = await call((await byEmail(email)).id)
      expect(status).toBe(200)
      expect(body).toMatchObject({ ok: true, email })

      // 1. A second email really went to that address.
      const second = emailAdapter.findEmailByTo(email)
      expect(second, 'the resend sent no email').toBeDefined()

      // 2. It carries a DIFFERENT token — a resend that re-sent the same token
      //    would pass every assertion below except this one.
      const secondToken = second!.html!.match(VERIFY_URL)![1]
      expect(secondToken).not.toBe(firstToken)

      // 3. The old link is dead. This is the assertion that says the token was
      //    rotated rather than merely re-mailed.
      await expect(
        payload.verifyEmail({ collection: 'managers', token: firstToken }),
      ).rejects.toThrow()

      // 4. The new one verifies, and login stops refusing — the whole point.
      await expect(
        payload.verifyEmail({ collection: 'managers', token: secondToken }),
      ).resolves.toBe(true)
      const result = await payload.login({
        collection: 'managers',
        data: { email, password: PASSWORD },
      })
      expect(result.user?.email).toBe(email)
    })

    it('renders the collection’s own verification template, not a second copy of it', async () => {
      const { email, first } = await createUnverified('template')

      emailAdapter.clearCapturedEmails()
      await call((await byEmail(email)).id)
      const second = emailAdapter.findEmailByTo(email)!

      // Byte-identical once the token is blanked out. A hand-written email that
      // merely *contained* a correct link would pass a link-shape assertion and
      // fail this one — which is the drift #320 was, one layer up.
      expect(withoutToken(second.html!)).toBe(withoutToken(first.html!))
      expect(second.subject).toBe(first.subject)
    })

    it('refuses an already-verified manager, and sends nothing', async () => {
      const { email, first } = await createUnverified('verified')
      await payload.verifyEmail({
        collection: 'managers',
        token: first.html!.match(VERIFY_URL)![1],
      })

      emailAdapter.clearCapturedEmails()
      const { status, body } = await call((await byEmail(email)).id)
      expect(status).toBe(409)
      expect(body).toMatchObject({ ok: false, reason: 'already-verified' })
      expect(emailAdapter.getCapturedEmails()).toHaveLength(0)
    })

    it('refuses a non-admin caller, sends nothing, and leaves the token alone', async () => {
      const { email } = await createUnverified('nonadmin')
      const id = (await byEmail(email)).id
      const before = await tokenOf(id)

      // ⚠ `null`, not `undefined`, for the unauthenticated caller — `undefined`
      // falls through to `call`'s default and runs the case as the admin, which
      // passes for the wrong reason. It did, before this comment existed.
      for (const caller of [
        null,
        { id: 2, collection: 'managers', type: 'manager' },
        { id: 3, collection: 'managers', type: 'inactive' },
        { id: 4, collection: 'clients', roles: ['sahaj-atlas-client'] },
      ]) {
        emailAdapter.clearCapturedEmails()
        const { status } = await call(id, caller)
        expect(status, `caller ${JSON.stringify(caller)} was not refused`).toBe(403)
        expect(emailAdapter.getCapturedEmails()).toHaveLength(0)
      }

      // The refusal has to happen BEFORE the token is rotated: a 403 that still
      // invalidated the outstanding link would break the manager it refused to help.
      expect(await tokenOf(id)).toBe(before)
    })

    it('restores the previous token when the send is dropped, and says so', async () => {
      const { email, first } = await createUnverified('dropped')
      const id = (await byEmail(email)).id
      const firstToken = first.html!.match(VERIFY_URL)![1]
      expect(await tokenOf(id)).toBe(firstToken)

      // The Resend adapter never throws on a delivery failure — it returns
      // `{ ok: false }` — so this is what a real drop looks like to the handler.
      const spy = vi
        .spyOn(payload, 'sendEmail')
        .mockResolvedValue({ ok: false, reason: 'api-error' } as never)
      let status: number
      try {
        ;({ status } = await call(id))
      } finally {
        spy.mockRestore()
      }

      expect(status).toBe(502)
      // The whole point: the manager is left exactly as they were, so the link
      // they may already be holding still works.
      expect(await tokenOf(id)).toBe(firstToken)
      await expect(
        payload.verifyEmail({ collection: 'managers', token: firstToken }),
      ).resolves.toBe(true)
    })

    it('404s an unknown manager and 400s an unusable id', async () => {
      expect((await call(99_999_999)).status).toBe(404)
      expect((await call('not-a-number')).status).toBe(400)
    })

    const byEmail = async (email: string) => {
      const found = await payload.find({
        collection: 'managers',
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
      })
      return found.docs[0]!
    }

    const tokenOf = async (id: number) =>
      (
        (await payload.findByID({
          collection: 'managers',
          id,
          showHiddenFields: true,
          overrideAccess: true,
        })) as { _verificationToken?: string | null }
      )._verificationToken
  })
})
