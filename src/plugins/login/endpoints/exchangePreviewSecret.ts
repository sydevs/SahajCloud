import type { LoginCollectionConfig, LoginDocument, PreviewSecretExchange } from '../types'
import type { Endpoint } from 'payload'

import { z } from 'zod'

import { parseBody } from '@/lib/endpoints'
import { constantTimeEqual } from '@/lib/utilities/constantTimeEqual'

import { createSession, sessionCookie } from '../session'

export const EXCHANGE_PREVIEW_SECRET_PATH = '/exchange-preview-secret'

// The address is not asked for: the route already holds the one it trades, and
// the caller echoing it back proved nothing while adding a way to refuse a
// correct secret. Unknown keys are stripped, so a caller still sending one — the
// smoke lane posts `PREVIEW_ADMIN` whole — is unaffected.
const bodySchema = z.object({
  password: z.string().min(1),
})

/**
 * The secret is never named back, so nothing here is an oracle.
 *
 * ⚠ **Built per call.** A `Response` is single-use, so a shared instance answers
 * the first refusal and throws a 500 on every one after it.
 */
const refused = () => Response.json({ errors: [{ message: 'Refused.' }] }, { status: 403 })

/**
 * `POST /api/<slug>/exchange-preview-secret`
 *
 * Trades `PREVIEW_ADMIN_PASSWORD` for a session on a Railway **preview**, so
 * the smoke lane still has a way in once `disableLocalStrategy` closes
 * `POST /api/<slug>/login`.
 *
 * ⚠ **`loginPlugin` wires this only where `shouldSeedPreviewAdminHere()` is
 * true**, so the route does not exist in production, in CI's integration lane,
 * or in local dev — the gate is the wiring, not a branch inside the handler.
 * That predicate is deliberately the same one that provisions the account
 * (`src/plugins/previewAdmin`): the secret is already a working admin
 * credential on every preview it is set for, so this is risk parity rather
 * than a new credential. It reads Railway's environment name, not `NODE_ENV`
 * — a preview runs `NODE_ENV=production` too.
 *
 * ⚠ **It authenticates against the environment, never a stored hash.** Nothing
 * on the account is consulted beyond its existence and eligibility, which is
 * what lets `seedPreviewAdmin` stop writing a password at all.
 *
 * Only the seeded preview admin's own address is tradeable. A second manager on
 * the preview cannot be signed into with the same secret, so the blast radius
 * stays the account the deploy already provisions.
 *
 * Auth: **intentionally anonymous** — the secret is the credential.
 */
export function exchangePreviewSecret(
  config: LoginCollectionConfig,
  exchange: PreviewSecretExchange,
): Endpoint {
  const { isEligible, select, slug } = config
  // ⚠ Normalised to the STORED spelling, because this is what the lookup
  // queries. Payload's `email` base field lowercases and trims on every write,
  // so a `PREVIEW_ADMIN_EMAIL` carrying a capital would otherwise match no row
  // and refuse a correct secret forever.
  const expectedEmail = exchange.email.trim().toLowerCase()

  return {
    path: EXCHANGE_PREVIEW_SECRET_PATH,
    method: 'post',
    handler: async (req) => {
      const parsed = await parseBody(req, bodySchema)
      if (!parsed.ok) return parsed.response

      const { payload } = req
      if (!constantTimeEqual(parsed.data.password, exchange.password)) return refused()

      // ⚠ `_verified` is not a column every auth collection has — Payload adds
      // it only for one configuring `auth.verify` (`getAuthFields.js`), so
      // `redeemToken` asks the same question before naming it.
      const verifies = Boolean(payload.collections[slug]?.config.auth?.verify)

      // Through `unknown` for the same reason `redeemToken` casts its own read:
      // a `SelectType` assembled at run time tells `find` nothing about which
      // fields survive, so its return widens to the whole slug union.
      const found = (await payload.find({
        collection: slug,
        where: { email: { equals: expectedEmail } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { ...select, ...(verifies ? { _verified: true } : {}) } as never,
      })) as unknown as { docs: LoginDocument[] }

      const account = found.docs[0]
      if (!account) return refused()
      // The JWT strategy refuses an unaccepted account, so minting without this
      // would answer 200 with a token that authenticates nobody — and land the
      // failure on the caller's next request rather than here.
      if (verifies && account._verified !== true) return refused()
      if (isEligible && !isEligible(account)) return refused()

      const token = await createSession(payload, slug, account.id)

      // The lane reads `token` off the body; the cookie is what a browser spec
      // needs, and both come from the one session minted above.
      return Response.json(
        { token },
        { headers: { 'Set-Cookie': sessionCookie(payload, slug, token) } },
      )
    },
  }
}
