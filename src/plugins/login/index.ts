/**
 * Login plugin
 *
 * Passwordless sign-in for any auth collection it is pointed at: one hidden
 * `magicLinkIssuedAt` field, and the two endpoints that trade an emailed link
 * for a session.
 *
 * - `loginPlugin` — the wiring, registered by `src/payload.config.ts` and the
 *   test harness alike. Its `collections` option names what it serves.
 * - `LoginCollectionConfig` — what one served collection supplies: its
 *   eligibility predicate and its mail. `src/collections/Managers/login.ts` is
 *   the one in use.
 * - `createSession` — the one place a session is minted without a password, for
 *   any auth collection that can hold one.
 * - `token.ts` — the two link kinds, as separate JWT audiences.
 *
 * ⚠ The endpoint *factories* are not re-exported here. `loginPlugin` is the only
 * caller, and exporting them would invite a collection to wire its own copy —
 * the split this plugin exists to hold.
 */

export { loginPlugin, type LoginPluginOptions } from './loginPlugin'

export { magicLinkIssuedAt, REQUEST_LINK_THROTTLE_MS } from './fields'

export { createSession } from './session'

export type { LoginCollectionConfig, LoginDocument, LoginMail, LoginMailArgs } from './types'

export {
  INVITE_TOKEN_TTL_MS,
  readInviteToken,
  readSigninToken,
  signInviteToken,
  signSigninToken,
  SIGNIN_TOKEN_TTL_MS,
  type LoginTokenClaims,
  type LoginTokenResult,
} from './token'
