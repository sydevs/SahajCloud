/**
 * Login plugin
 *
 * Passwordless sign-in for any auth collection it is pointed at: one hidden
 * `magicLinkIssuedAt` field, and the three endpoints that trade an emailed link
 * for a session — a request route, the confirmation page a delivered link
 * opens, and the POST behind that page's form which actually spends it.
 *
 * - `loginPlugin` — the wiring, registered by `src/payload.config.ts` and the
 *   test harness alike. Its `collections` option names what it serves.
 * - `LoginCollectionConfig` — what one served collection supplies. Every member
 *   is optional beyond the slug; `src/collections/Managers/login.ts` is the one
 *   in use.
 * - `createSession` — the one place a session is minted without a password, for
 *   any auth collection that can hold one.
 * - `issueMagicLink` — minting, throttling and sending a link, shared by the
 *   request endpoint and the sign-in page.
 * - `token.ts` — the two link kinds, as separate JWT audiences.
 *
 * ⚠ The endpoint *factories* are not re-exported here. `loginPlugin` is the only
 * caller, and exporting them would invite a collection to wire its own copy —
 * the split this plugin exists to hold. The work they wire is a different
 * matter: `issueMagicLink` and `createSession` each have two callers and live in
 * their own modules for that reason.
 */

export {
  issueMagicLink,
  magicLinkEmailSchema,
  REQUEST_LINK_THROTTLE_MS,
  SIGNIN_VALID_FOR,
} from './magicLinks'

export { loginPlugin, magicLinkIssuedAt, type LoginPluginOptions } from './loginPlugin'

export { createSession } from './session'

export type { LoginCollectionConfig, LoginDocument, LoginMailArgs } from './types'

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
