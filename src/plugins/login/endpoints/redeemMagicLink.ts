import type { LoginCollectionConfig } from '../types'
import type { Endpoint } from 'payload'

import { readSigninToken } from '../token'
import { redeemToken } from './redeemToken'

export const REDEEM_MAGIC_LINK_PATH = '/redeem-magic-link'

/**
 * `POST /api/<slug>/redeem-magic-link?token=…`
 *
 * Trades a valid sign-in link for a session cookie and redirects the holder.
 * `loginPlugin` builds one of these per entry in its `collections` option.
 * {@link redeemToken} holds the body, and every ⚠ in its docblock applies here.
 */
export function redeemMagicLink(config: LoginCollectionConfig): Endpoint {
  return redeemToken(config, {
    expiredReason: 'expired',
    // Single use, and mutual exclusion between outstanding links, both come
    // from this one equality: `requestMagicLink` stamps the field with the same
    // instant it signs into the claim, so a consumed or superseded link no
    // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
    isUnspent: (account, claims) => {
      const stamped = account.magicLinkIssuedAt
      return Boolean(stamped) && new Date(stamped!).getTime() === claims.issuedAt
    },
    path: REDEEM_MAGIC_LINK_PATH,
    read: readSigninToken,
    select: { magicLinkIssuedAt: true },
  })
}
