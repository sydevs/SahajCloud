/**
 * Login plugin — passwordless sign-in for any auth collection it is pointed at.
 *
 * - `loginPlugin.ts` — the wiring: fields, hooks, the admin login view, and
 *   the invitation job. `src/collections/Managers/login.ts` is the one entry.
 * - `endpoints/` — the request route, and the one route that spends any link.
 * - `magicLinks.ts` — issuing a sign-in link, shared by the request route and
 *   the sign-in page.
 * - `token.ts` / `links.ts` — the three link kinds as separate JWT audiences,
 *   and the URLs each is mailed as.
 * - `session.ts` — minting a session without a password, and its cookie.
 * - `invitations.ts`, `invite.ts`, `grantSummary.ts` — the invitation queue, the
 *   invitation it sends, and what that invitation names (#839).
 *
 * ⚠ The routes are not exported, only their paths. `loginPlugin` is their one
 * caller, and exporting them would invite a collection to wire its own copy.
 */

export { EXPIRED_REASON, REDEEM_PATH } from './endpoints/redeem'
export { INVITE_VALID_FOR, composeInvitations } from './invite'
export { INVITATION_DELAY_MS } from './invitations'
export { pageLinkUrl } from './links'
export { loginPlugin, magicLinkIssuedAt } from './loginPlugin'
export {
  issueMagicLink,
  magicLinkEmailSchema,
  mintSignInLink,
  REQUEST_LINK_THROTTLE_MS,
  SIGNIN_VALID_FOR,
} from './magicLinks'
export { createSession, sessionCookie, sessionCookieParts } from './session'
export { summarizeGrants } from './grantSummary'
export {
  INVITE_TOKEN_TTL_MS,
  isAdminPath,
  LINK_TOKEN_TTL_MS,
  readAnyLoginToken,
  readInviteToken,
  readLinkToken,
  readSigninToken,
  signInviteToken,
  signLinkToken,
  signSigninToken,
  SIGNIN_TOKEN_TTL_MS,
} from './token'
export type { LoginCollectionConfig, LoginMailArgs } from './types'
