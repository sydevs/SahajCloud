import type { Payload } from 'payload'

import { generateCookie, parseCookies } from 'payload/shared'

import { signToken, verifyToken } from '@/lib/utilities/signedToken'

import { IMPERSONATION_COOKIE } from './gate'

/** The token's audience. Distinct from every link kind (`tests/unit/login-token.spec.ts`). */
export const IMPERSONATION_TOKEN_KIND = 'support-impersonation'

/**
 * 30 days. The cookie only names whom support acts as; whether it still works
 * is decided per request by the support session it is bound to, so this bounds
 * nothing but how long a dead cookie lingers in the browser.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * What the cookie carries.
 *
 * ⚠ **No `id`, `collection` or `sid` claim.** The token is signed with
 * `payload.secret`, and Payload's JWT verifier reads exactly those three, so
 * the names are what keeps this token from ever reading as a session — the
 * same rule `@/plugins/login/token.ts` keeps for its links.
 */
export interface ImpersonationClaims {
  /** The support account's manager id. */
  actor: number | string
  /** The support session the cookie is bound to; `null` under local auto-login. */
  actorSession: string | null
  /** The manager support is acting as. */
  target: number | string
  /** The target's project switcher, held here so their own row is never written. */
  project: string | null
}

export function signImpersonation(payload: Payload, claims: ImpersonationClaims): Promise<string> {
  return signToken({ ...claims }, { kind: IMPERSONATION_TOKEN_KIND, ttlMs: null }, payload.secret)
}

/** The cookie's claims, or `null` when there is none or it does not verify. */
export async function readImpersonation(
  payload: Payload,
  headers: Headers,
): Promise<ImpersonationClaims | null> {
  const token = parseCookies(headers).get(IMPERSONATION_COOKIE)
  if (!token) return null
  const result = await verifyToken<ImpersonationClaims>(
    token,
    IMPERSONATION_TOKEN_KIND,
    payload.secret,
  )
  return result.status === 'valid' ? result.claims : null
}

/**
 * The `Set-Cookie` value, with the session cookie's own `secure`, `sameSite`
 * and `domain` so the two travel together. `token: null` clears it.
 */
export function impersonationCookie(payload: Payload, token: string | null): string {
  const { cookies } = payload.collections.managers.config.auth
  return generateCookie<false>({
    name: IMPERSONATION_COOKIE,
    value: token ?? '',
    domain: cookies.domain ?? undefined,
    httpOnly: true,
    path: '/',
    returnCookieAsObject: false,
    sameSite: typeof cookies.sameSite === 'string' ? cookies.sameSite : undefined,
    secure: cookies.secure,
    ...(token ? { maxAge: COOKIE_MAX_AGE_SECONDS } : { expires: new Date(0) }),
  })
}
