import type { LoginCollectionConfig } from '../types'
import type { Endpoint } from 'payload'

import { readLinkToken } from '../token'
import { redeemToken } from './redeemToken'

export const REDEEM_LINK_PATH = '/redeem-link'

/**
 * `POST /api/<slug>/redeem-link` — spend a link that signs its holder in on the
 * way to one admin page (an event-verification reminder's).
 *
 * ⚠ **Not single-use**, unlike its two siblings, so `isUnspent` is constant. A
 * reminder is re-read and clicked twice, and it names the page rather than
 * granting anything a sign-in link would not. It still expires, and
 * `redeemToken` still refuses an account that has stopped qualifying.
 *
 * Accepting rides along, as it does for an invitation: `redeemToken` sets
 * `_verified`, so an imported manager whose first email is a reminder is signed
 * in by it rather than stopped at a login they cannot pass.
 */
export function redeemLink(config: LoginCollectionConfig): Endpoint {
  return redeemToken(config, {
    expiredReason: 'link-expired',
    isUnspent: () => true,
    path: REDEEM_LINK_PATH,
    read: readLinkToken,
    // Checked at signing and at reading (`isAdminPath`), so this is always an
    // admin path this server chose.
    redirectTo: (claims) => claims.to,
    select: {},
  })
}
