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
 * - `token.ts` — the three link kinds, as separate JWT audiences.
 * - `pageLinkUrl` — a link that signs its holder in on the way to one admin
 *   page, which is what an event-verification reminder carries.
 * - `invitations.ts` — the invitation queue: an account is invited when it is
 *   assigned a role, region, event or page, never on create (#839). The
 *   invitation names what was assigned — one email per project, each branded
 *   for its own.
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
  mintSignInLink,
  REQUEST_LINK_THROTTLE_MS,
  SIGNIN_VALID_FOR,
} from './magicLinks'

export { loginPlugin, magicLinkIssuedAt, type LoginPluginOptions } from './loginPlugin'

export {
  generateInviteEmailHTML,
  generateInviteEmailSubject,
  INVITE_VALID_FOR,
  inviteUrl,
  composeInvitations,
  namesAnything,
  signInviteFor,
} from './invite'

export {
  summarizeGrants,
  type GrantSummary,
  type LocaleGrant,
  type PendingInvitation,
  type Responsibility,
  type ResponsibilityItem,
} from './grantSummary'

export { INVITATION_DELAY_MS, INVITATIONS_QUEUE } from './invitations'

export { createSession, sessionCookie, sessionCookieParts } from './session'

// The redeem PATHS, not their factories: the sign-in page addresses its
// forms at them, and a literal there would survive a rename silently.
export { REDEEM_INVITE_PATH } from './endpoints/redeemInvite'
export { REDEEM_LINK_PATH } from './endpoints/redeemLink'
export { REDEEM_MAGIC_LINK_PATH } from './endpoints/redeemMagicLink'

export type { LoginCollectionConfig, LoginDocument, LoginMailArgs } from './types'

export { pageLinkUrl } from './pageLink'

export {
  INVITE_TOKEN_TTL_MS,
  isAdminPath,
  LINK_TOKEN_TTL_MS,
  readInviteToken,
  readLinkToken,
  readSigninToken,
  signInviteToken,
  signLinkToken,
  signSigninToken,
  SIGNIN_TOKEN_TTL_MS,
  type LinkTokenClaims,
  type LinkTokenResult,
  type LoginTokenClaims,
  type LoginTokenResult,
} from './token'
