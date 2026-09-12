/**
 * Classifying the credential a failed request presented.
 *
 * Pure on purpose, so the unit lane covers it without booting Payload.
 *
 * ⚠ **Nothing here may return the credential, or any substring of it.** The
 * only value derived from the key is a truncated SHA-256 of it.
 *
 * Why the signal exists and what it cannot see: `docs/architecture.md`.
 */
import { createHash } from 'node:crypto'

/**
 * How the request's credential fared, from the error hook's point of view.
 *
 * - `anonymous` — nobody authenticated, and no `Authorization` header.
 * - `authenticated` — a caller Payload authenticated, by any strategy.
 * - `rejected` — a header that did NOT authenticate. Always a broken integration.
 *
 * Only `rejected` changes what the hook reports. `sentry-auth-attempt.spec.ts`
 * pins that neither of the other two escalates, and a report that stopped
 * telling the three apart is #734 back again.
 */
export type AuthOutcome = 'anonymous' | 'authenticated' | 'rejected'

export interface AuthAttempt {
  outcome: AuthOutcome
  /** The auth collection, set only when the header named a real one. */
  authCollection?: string
  /** The header's auth scheme, or `unknown` when it is not one we recognise. */
  authScheme?: string
  /** Truncated SHA-256 of the presented credential. Never the credential. */
  keyFingerprint?: string
}

/**
 * ⚠ **Allowlist, never "the first word of the header"** — a malformed header's
 * first word can BE the credential, and echoing it leaks the key.
 */
const KNOWN_SCHEMES = ['api-key', 'bearer', 'basic', 'digest', 'jwt']

/**
 * A stable, non-reversible name for a credential. Never the credential.
 *
 * 12 hex characters: enough to tell two integrations apart, far too few to attack.
 */
export const credentialFingerprint = (credential: string): string =>
  createHash('sha256').update(credential).digest('hex').slice(0, 12)

/**
 * Decide which of the three auth outcomes a failed request represents.
 *
 * `hasUser` is `Boolean(req.user)`: Payload sets it once any strategy has
 * authenticated, so a header present with no user means every strategy refused
 * the credential. Attribution is returned only for that case.
 */
export const classifyAuthAttempt = (
  authorization: string | null | undefined,
  hasUser: boolean,
  isKnownCollection: (slug: string) => boolean,
): AuthAttempt => {
  // Asked before the header. A cookie-authenticated manager's 403 carries no
  // `Authorization` header, so header-first would file it under `anonymous` —
  // the one outcome it is not.
  if (hasUser) return { outcome: 'authenticated' }

  const [head, ...rest] = (authorization ?? '').trim().split(/\s+/)
  if (!head) return { outcome: 'anonymous' }

  // The API-key format is `<slug> API-Key <key>`, pinned by the OpenAPI security
  // scheme (`src/plugins/openapi/specFilter.ts`).
  if (rest.length >= 2 && rest[0].toLowerCase() === 'api-key') {
    return {
      outcome: 'rejected',
      // ⚠ **Only a real slug is reported.** This word is caller-controlled and
      // reaches a Sentry fingerprint, so unchecked it would let any caller mint
      // one Sentry issue per value it invents. Only the config layer knows the
      // real slugs, so it answers.
      authCollection: isKnownCollection(head) ? head : undefined,
      authScheme: 'API-Key',
      keyFingerprint: credentialFingerprint(rest.slice(1).join(' ')),
    }
  }

  // Anything else is `<scheme> <credential>`, and a lone token is all credential.
  return {
    outcome: 'rejected',
    authScheme:
      rest.length === 0 ? undefined : KNOWN_SCHEMES.includes(head.toLowerCase()) ? head : 'unknown',
    keyFingerprint: credentialFingerprint(rest.length === 0 ? head : rest.join(' ')),
  }
}
