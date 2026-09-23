/**
 * Login plugin
 *
 * Passwordless sign-in for `managers`: one hidden `magicLinkIssuedAt` field,
 * and the two endpoints that trade an emailed link for a session.
 *
 * - `loginPlugin` — the wiring, registered by `src/payload.config.ts` and the
 *   test harness alike.
 * - `createSession` — the one place a session is minted without a password, for
 *   any auth collection that can hold one.
 * - `token.ts` — the two link kinds, as separate JWT audiences.
 *
 * ⚠ The endpoint definitions are **not** re-exported here. They live beside
 * their collection and `loginPlugin` imports them, so exporting them would
 * close a cycle through this barrel. `docs/rules/endpoints.md` owns that rule.
 */

export { loginPlugin, type LoginPluginOptions } from './loginPlugin'

export { magicLinkIssuedAt, REQUEST_LINK_THROTTLE_MS } from './fields'

export { createSession } from './session'

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
