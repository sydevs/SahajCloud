#!/usr/bin/env node
/**
 * Print a sign-in link for an existing manager, without sending mail (#840).
 *
 * ⚠ **This is production's break-glass entry.** A manager holds no password
 * and `POST /api/managers/login` is closed, so an emailed link is the only way
 * in — and email delivery is exactly what fails when you need to get in. This
 * script mints the same token the mail carries and prints the URL instead.
 *
 * It is not a credential: it runs only where `DATABASE_URL` and
 * `PAYLOAD_SECRET` already are — a Railway shell, a deploy console — so it
 * grants nothing to anyone who does not already hold the database and the
 * signing key. That is why it stays a script and never became an endpoint: the
 * exchange route this PR deleted was one env-var typo away from being a way in
 * on production.
 *
 * The link is valid for `SIGNIN_TOKEN_TTL_MS` (15 minutes) and burns on use,
 * like every other one. `magicLinkIssuedAt` is deliberately not stamped: the
 * throttle bounds what an anonymous request can generate, and stamping here
 * would lock the operator out of the mailed path for a minute after a run that
 * may have gone to the wrong address.
 *
 * Usage:
 *   pnpm tsx scripts/signin-link.ts <email>
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET, and SAHAJCLOUD_URL for the
 * host the link addresses.
 */
import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { managersLogin } from '../src/collections/Managers/login'
import { signSigninToken } from '../src/plugins/login/token'

async function main(): Promise<void> {
  const [email] = process.argv.slice(2)
  if (!email) {
    console.error('Usage: pnpm tsx scripts/signin-link.ts <email>')
    process.exit(1)
  }

  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  const payload = await getPayload({ config: await configPromise })
  const { getServerUrl } = await import('../src/lib/utilities/serverUrl')

  const { docs } = await payload.find({
    collection: 'managers',
    where: { email: { equals: email.trim().toLowerCase() } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { _verified: true, email: true, type: true },
  })

  const account = docs[0]
  if (!account) {
    console.error(`No manager exists for ${email}. Create one with scripts/create-manager.ts.`)
    process.exit(1)
  }

  // Both refusals the request path applies, restated here because this one
  // skips `issueMagicLink` — a link for an account the JWT strategy yields no
  // user for authenticates nobody, one request later, and printing it would
  // read as a working break-glass that is not one.
  if (!managersLogin.isEligible?.(account)) {
    console.error(`${account.email} is inactive. Reactivate the manager first.`)
    process.exit(1)
  }
  if (account._verified !== true) {
    console.error(`${account.email} has never accepted an invitation, so a sign-in link is refused.`)
    process.exit(1)
  }

  const token = await signSigninToken(
    { collection: 'managers', issuedAt: Date.now(), userId: account.id },
    payload.secret,
  )

  console.log(
    `${getServerUrl()}${managersLogin.requestPagePath}?token=${encodeURIComponent(token)}`,
  )
  process.exit(0)
}

void main()
