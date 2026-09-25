import type { LoginCollectionConfig } from '../types'
import type { Endpoint } from 'payload'

import { readInviteToken } from '../token'
import { redeemToken } from './redeemToken'

export const REDEEM_INVITE_PATH = '/redeem-invite'

/**
 * `POST /api/<slug>/redeem-invite?token=…`
 *
 * Accepts an invitation: marks the account verified and signs its holder in.
 * The sibling of `redeem-magic-link`, sharing {@link redeemToken}'s body, and
 * every ⚠ in that docblock applies here unchanged.
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
  return redeemToken(config, {
    expiredReason: 'invite-expired',
    // See the docblock — this is the single-use check.
    isUnspent: (account) => account._verified !== true,
    path: REDEEM_INVITE_PATH,
    read: readInviteToken,
    select: { _verified: true },
  })
}
