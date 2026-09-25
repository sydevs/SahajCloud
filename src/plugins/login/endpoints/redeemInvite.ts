import type { LoginCollectionConfig, LoginDocument } from '../types'
import type { Endpoint } from 'payload'

import { generatePayloadCookie } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { createSession } from '../session'
import { readInviteToken } from '../token'

export const REDEEM_INVITE_PATH = '/redeem-invite'

/** Where an accepted invitation lands the holder, unless the collection names another. */
const DEFAULT_REDIRECT = '/admin'

/**
 * `POST /api/<slug>/redeem-invite?token=…`
 *
 * Accepts an invitation: marks the account verified and signs its holder in.
 * The sibling of `redeem-magic-link`, and everything that file's docblock says
 * about `POST`, the query string and the hand-built 302 applies here unchanged.
 *
 * ⚠ **A separate route because the audiences are separate.** `readInviteToken`
 * refuses a sign-in token natively, and the sign-in route refuses this one, so
 * a 7-day invitation cannot be replayed as a 15-minute sign-in link.
 *
 * ⚠ **`_verified` is what makes an invitation single-use**, not the
 * `magicLinkIssuedAt` equality its sibling matches. An invitation minted during
 * `create` stamps nothing — the create's own transaction is still open — so the
 * flag the acceptance sets is the only thing that can refuse the second click.
 * An account already verified is therefore refused outright.
 */
export function redeemInvite(config: LoginCollectionConfig): Endpoint {
  const { requestPagePath, slug } = config

  const refuse = (reason: 'invalid' | 'invite-expired') =>
    new Response(null, {
      status: 302,
      headers: {
        // `no-store` is load-bearing: the URL this answers carries the
        // credential in its query string.
        'Cache-Control': 'no-store',
        Location: `${getServerUrl()}${requestPagePath}?error=${reason}`,
        'Referrer-Policy': 'no-referrer',
      },
    })

  /** An authentic invitation whose seven days ran out. The one refusal worth distinguishing. */
  const expired = () => refuse('invite-expired')

  // Everything else: tampered, a sign-in token, already accepted, or minted for
  // an account that has since stopped qualifying. Collapsed into one answer, so
  // the page describes none of these checks to whoever is probing them.
  const invalid = () => refuse('invalid')

  return {
    path: REDEEM_INVITE_PATH,
    method: 'post',
    handler: async (req) => {
      const { payload } = req
      const token = typeof req.query?.token === 'string' ? req.query.token : null

      const result = await readInviteToken(token, payload.secret)
      if (result.status === 'expired') return expired()
      if (result.status !== 'valid') return invalid()

      const { claims } = result
      // The claim names its own collection, so a token minted for one served
      // collection cannot accept an invitation to another.
      if (claims.collection !== slug) return invalid()

      let account: LoginDocument
      try {
        account = (await payload.findByID({
          collection: slug,
          id: claims.userId,
          depth: 0,
          // See the same cast in `redeemMagicLink`: `joins` collapses over the slug union.
          joins: false as never,
          overrideAccess: true,
          select: { _verified: true, ...config.select },
        })) as LoginDocument
      } catch {
        // A deleted account. `findByID` throws `NotFound` rather than returning null.
        return invalid()
      }

      // Re-checked here, not only when the invitation was sent: an account
      // deactivated in the meantime must not be able to accept it.
      if (config.isEligible && !config.isEligible(account)) return invalid()

      // Already accepted. See the docblock — this is the single-use check.
      if (account._verified === true) return invalid()

      // Its own operation, deliberately unjoined to `req`'s transaction, for the
      // reason `redeemMagicLink` states: accepting must survive a failure to mint
      // the session below. `magicLinkIssuedAt` is cleared because a resent
      // invitation stamps it, and leaving it set would throttle the sign-in link
      // this manager may ask for next.
      await payload.update({
        collection: slug,
        id: account.id,
        data: { _verified: true, magicLinkIssuedAt: null } as never,
        depth: 0,
        overrideAccess: true,
      })

      const sessionToken = await createSession(payload, slug, account.id)

      const cookie = generatePayloadCookie({
        collectionAuthConfig: payload.collections[slug]!.config.auth,
        cookiePrefix: payload.config.cookiePrefix,
        token: sessionToken,
      })

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${getServerUrl()}${config.redirectTo ?? DEFAULT_REDIRECT}`,
          'Set-Cookie': cookie,
        },
      })
    },
  }
}
