/**
 * Login plugin
 *
 * Passwordless sign-in for an auth collection: one hidden `magicLinkIssuedAt`
 * field, and the two endpoints that trade an emailed link for a session.
 *
 * - `loginPlugin` / `LOGIN_PLUGIN_OPTIONS` — the wiring, shared by
 *   `src/payload.config.ts` and the test harness.
 * - `createSession` — the one place a session is minted without a password.
 * - `token.ts` — the two link kinds, as separate JWT audiences.
 *
 * ⚠ The endpoint definitions are **not** re-exported here. They live beside
 * their collection and are imported by `loginPlugin`, so exporting them would
 * close a cycle through this barrel.
 *
 * @example
 * ```typescript
 * import { loginPlugin, LOGIN_PLUGIN_OPTIONS } from '@/plugins/login'
 *
 * plugins: [
 *   loginPlugin(LOGIN_PLUGIN_OPTIONS),
 *   // accessPlugin stays last
 * ]
 * ```
 */

export { loginPlugin, LOGIN_PLUGIN_OPTIONS, type LoginPluginOptions } from './loginPlugin'

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
