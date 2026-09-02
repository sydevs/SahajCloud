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
import type { Payload } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { Managers } from '@/collections'
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
})
