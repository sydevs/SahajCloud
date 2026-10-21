/**
 * The pure half of `redeem-signin-link.ts`: reading a sign-in link, finding the
 * session its redeem buys, and wording a refusal. No network and no filesystem, so
 * `tests/unit/signin-token.spec.ts` covers it.
 */

export interface SignInLink {
  /** The server the link addresses, which is the one the session is valid on. */
  origin: string
  token: string
  /** The auth collection the token signs into, from its own claims. */
  collection: string
  expiresAt: Date
}

/**
 * A JWT's claims, **unverified**. Only the server can verify one, and it does on
 * redeem — these are read to address the request and to refuse an expired link
 * before spending a round trip on it.
 */
export function readJwtClaims(jwt: string): Record<string, unknown> {
  const claims = jwt.split('.')[1]
  if (!claims) throw new Error('The token is not a JWT.')
  try {
    return JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'))
  } catch {
    throw new Error('The token is not a JWT.')
  }
}

export function parseSignInLink(link: string): SignInLink {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    throw new Error('That is not a URL. Paste the whole sign-in link from the email.')
  }

  const token = url.searchParams.get('token')
  if (!token) {
    throw new Error('The link carries no ?token=. Paste the whole sign-in link from the email.')
  }

  const { collection, exp } = readJwtClaims(token)
  if (typeof collection !== 'string' || typeof exp !== 'number') {
    throw new Error('The token names no collection or expiry, so it is not a sign-in link.')
  }

  return { origin: url.origin, token, collection, expiresAt: new Date(exp * 1000) }
}

/**
 * The session token in a redeem's `Set-Cookie` headers, or `null` when it set
 * none. `payload-token` is `${cookiePrefix}-token` under the default prefix,
 * which `src/payload.config.ts` keeps.
 */
export function sessionTokenFrom(setCookies: string[], cookieName = 'payload-token'): null | string {
  for (const cookie of setCookies) {
    const [pair] = cookie.split(';')
    const separator = pair!.indexOf('=')
    if (pair!.slice(0, separator).trim() !== cookieName) continue
    // An empty value is a cookie being cleared, not a session.
    return pair!.slice(separator + 1).trim() || null
  }
  return null
}

/**
 * Why a redeem bought no session, from the `?error=` its refusal redirects to
 * (`EXPIRED_REASON` and `refuse` in `src/plugins/login/endpoints/redeem.ts`).
 */
export function describeRefusal(status: number, location: null | string): string {
  const reason = location ? new URL(location, 'http://placeholder').searchParams.get('error') : null

  switch (reason) {
    case 'expired':
    case 'link-expired':
    case 'invite-expired':
      return 'The link has expired. Request a new one.'
    case 'invite-accepted':
      return 'That invitation was already accepted. Request a sign-in link instead.'
    case 'invalid':
      // The route answers `invalid` for a spent sign-in link too: it has no
      // spent wording for that kind, and a newer link supersedes an older one.
      return (
        'The server refused the link. It was already used, a newer link replaced it, ' +
        'or the account is inactive. Request a new one.'
      )
    default:
      return `The server answered ${status} and set no session${reason ? ` (error=${reason})` : ''}.`
  }
}
