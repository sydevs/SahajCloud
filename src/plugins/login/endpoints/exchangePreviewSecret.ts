import type { LoginCollectionConfig, LoginDocument } from '../types'
import type { Endpoint } from 'payload'

import { timingSafeEqual } from 'node:crypto'

import { generatePayloadCookie } from 'payload/shared'
import { z } from 'zod'

import { parseBody } from '@/lib/endpoints'

import { createSession } from '../session'

export const EXCHANGE_PREVIEW_SECRET_PATH = '/exchange-preview-secret'

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

/**
 * Neither the address nor the secret is named back, so nothing here is an oracle.
 *
 * ⚠ **Built per call.** A `Response` is single-use, so a shared instance answers
 * the first refusal and throws a 500 on every one after it.
 */
const refused = () => Response.json({ errors: [{ message: 'Refused.' }] }, { status: 403 })

/** Equal-length compare, so a mismatched length is not a shortcut. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface PreviewSecretExchange {
  /** The one address this trades for, already resolved by the caller. */
  email: string
  /** `PREVIEW_ADMIN_PASSWORD`. Non-null: `loginPlugin` wires this route only where it is set. */
  password: string
}

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
  const { slug } = config

  return {
    path: EXCHANGE_PREVIEW_SECRET_PATH,
    method: 'post',
    handler: async (req) => {
      const parsed = await parseBody(req, bodySchema)
      if (!parsed.ok) return parsed.response

      const { payload } = req
      if (parsed.data.email.toLowerCase() !== exchange.email.toLowerCase()) return refused()
      if (!secretMatches(parsed.data.password, exchange.password)) return refused()

      // Through `unknown` for the same reason `redeemToken` casts its own read:
      // a `SelectType` assembled at run time tells `find` nothing about which
      // fields survive, so its return widens to the whole slug union.
      const found = (await payload.find({
        collection: slug,
        where: { email: { equals: exchange.email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { ...config.select } as never,
      })) as unknown as { docs: LoginDocument[] }

      const account = found.docs[0]
      if (!account) return refused()
      if (config.isEligible && !config.isEligible(account)) return refused()

      const token = await createSession(payload, slug, account.id)

      return Response.json(
        { token },
        {
          headers: {
            // The lane reads `token` off the body; the cookie is what a browser
            // spec needs, and both come from the one session minted above.
            'Set-Cookie': generatePayloadCookie({
              collectionAuthConfig: payload.collections[slug]!.config.auth,
              cookiePrefix: payload.config.cookiePrefix,
              token,
            }),
          },
        },
      )
    },
  }
}
