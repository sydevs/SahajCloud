/**
 * Live-preview tokens — the credential the admin panel puts on a preview URL.
 *
 * ## Why not the shared secret
 *
 * `SAHAJCLOUD_PREVIEW_SECRET` is long-lived and symmetric. Putting it on a URL
 * leaks it permanently to anything that reads a URL: the browser's history, a
 * `Referer`, Sentry's session replay, and — measured on WeMeditateWeb — an
 * analytics script that posts `location.href`. It also cannot be verified by a
 * client without giving that client the ability to mint, which rules out the
 * atlas entirely: a public bundle that holds a symmetric key has published it.
 *
 * So the CMS **signs**, and the consumers **verify**:
 *
 * - The private key never leaves this service.
 * - The public key is not a secret. Both consumers commit it, so there is no
 *   second copy to keep in sync and rotation touches one platform.
 * - A token that escapes into a replay or a screenshot expires on its own.
 *
 * ## What the token binds
 *
 * `{ aud, exp }` — which site it is for, and when it dies. **Not the path.**
 * Path binding breaks on WeMeditateWeb's `/en/*` → `/*` redirect, on the
 * atlas's own in-app navigation, and on a slug renamed mid-edit — each a silent
 * preview failure rather than an error. With a 45-minute life, replay across
 * pages of the same site buys nothing that previewing the page directly would
 * not.
 *
 * ⚠ **This is a bearer credential for draft content, not an identity.** It says
 * "the CMS issued this, recently", never "who". Anything needing attribution
 * wants a session, not this.
 */

/** The sites a token may be issued for. A token is valid for exactly one. */
export type LivePreviewAudience = 'wm-web' | 'sy-atlas'

/**
 * How long a freshly minted token lives.
 *
 * Long enough that an editor does not lose the panel mid-sentence — the URL is
 * re-resolved on save, so a working session keeps renewing it — and short
 * enough that a leaked one is worthless by the time anyone reads the log it
 * landed in.
 */
export const LIVE_PREVIEW_TOKEN_TTL_SECONDS = 45 * 60

/** The signature algorithm, named once so both halves cannot drift. */
const ALGORITHM = 'Ed25519'

/** The claims a token carries. Kept small: it rides in a URL. */
export interface LivePreviewClaims {
  aud: LivePreviewAudience
  /** Expiry, as unix seconds. */
  exp: number
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * The configured key pair, imported once per process.
 *
 * ⚠ **The key is a JWK, not PKCS8.** A PKCS8 private key cannot yield its own
 * public half through Web Crypto, and this service needs both: it *mints*
 * tokens for the panel and *verifies* them again when a consumer forwards one
 * back. A JWK carries `x` (public) beside `d` (private), so one variable gives
 * both and the two can never drift out of step — which two variables would
 * eventually do, silently, in a way that looks exactly like a forged token.
 *
 * Held as the promise, not the resolved keys, so concurrent callers share one
 * import rather than racing several. A malformed or absent key resolves to
 * `null` and is cached as such — this is config, so retrying per request would
 * only repeat the same failure at request cost.
 */
interface LivePreviewKeys {
  sign: CryptoKey
  verify: CryptoKey
}

let keys: Promise<LivePreviewKeys | null> | undefined

async function getKeys(keyBase64: string | undefined): Promise<LivePreviewKeys | null> {
  if (!keys) {
    keys = (async () => {
      if (!keyBase64) return null

      let jwk: JsonWebKey
      try {
        jwk = JSON.parse(atob(keyBase64.replace(/\s/g, ''))) as JsonWebKey
      } catch {
        return null
      }

      try {
        const sign = await crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['sign'])
        // The public half is the same JWK with the private scalar removed.
        // `key_ops`/`ext` are dropped too: they describe the private key, and
        // importing a verify key that still claims `sign` is refused.
        const { d: _d, key_ops: _ops, ext: _ext, ...publicJwk } = jwk as JsonWebKey & { d?: string }
        const verify = await crypto.subtle.importKey('jwk', publicJwk, ALGORITHM, true, ['verify'])

        return { sign, verify }
      } catch {
        return null
      }
    })()
  }
  return keys
}

/** Test seam: drops the cached keys so a spec can swap the configured value. */
export function resetLivePreviewKeyCache(): void {
  keys = undefined
}

/**
 * The raw 32-byte public key, for handing to a consumer that must verify.
 *
 * `null` when no key is configured — the same "live preview is simply not
 * available" state every other entry point degrades to.
 */
export async function livePreviewPublicKey(
  keyBase64: string | undefined,
): Promise<Uint8Array | null> {
  const pair = await getKeys(keyBase64)
  if (!pair) return null

  return new Uint8Array(await crypto.subtle.exportKey('raw', pair.verify))
}

/**
 * Mints a token for one site, or `null` when no signing key is configured.
 *
 * ⚠ **`null` is a supported outcome, not an error.** An environment with no key
 * — a fresh checkout, a preview deploy that never had the variable — should
 * render the admin panel and simply not offer live preview. Callers turn `null`
 * into the "unavailable" page rather than a broken URL or a thrown boot.
 */
export async function mintLivePreviewToken(
  aud: LivePreviewAudience,
  keyBase64: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const pair = await getKeys(keyBase64)
  if (!pair) return null

  const claims: LivePreviewClaims = { aud, exp: nowSeconds + LIVE_PREVIEW_TOKEN_TTL_SECONDS }
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)))
  const signature = await crypto.subtle.sign(
    ALGORITHM,
    pair.sign,
    new TextEncoder().encode(body) as BufferSource,
  )

  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`
}

/**
 * Verifies a token against a raw 32-byte Ed25519 public key.
 *
 * Lives here, beside the minter, so the two halves of the format cannot drift —
 * and so this repo's own specs can prove a minted token verifies. The consumers
 * each carry their own copy of this logic, because neither imports from this
 * repo; `tests/unit/live-preview-token.spec.ts` is the shared reference.
 *
 * Returns false for every failure — bad shape, bad signature, wrong audience,
 * expired — and never throws or says which. A caller learning *why* its token
 * was refused learns how to forge a better one.
 */
export async function verifyLivePreviewToken(
  token: string,
  expectedAudience: LivePreviewAudience,
  publicKeyRaw: Uint8Array,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const [body, signature] = token.split('.')
  if (!body || !signature) return false

  const signatureBytes = base64UrlDecode(signature)
  const claimsBytes = base64UrlDecode(body)
  if (!signatureBytes || !claimsBytes) return false

  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('raw', publicKeyRaw as BufferSource, ALGORITHM, false, [
      'verify',
    ])
  } catch {
    return false
  }

  const signatureValid = await crypto.subtle.verify(
    ALGORITHM,
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(body) as BufferSource,
  )
  if (!signatureValid) return false

  // Only decoded AFTER the signature holds, so nothing downstream ever parses
  // attacker-controlled JSON that has not been authenticated.
  let claims: LivePreviewClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(claimsBytes)) as LivePreviewClaims
  } catch {
    return false
  }

  if (claims.aud !== expectedAudience) return false
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return false

  return true
}

/**
 * Verifies a token against **this service's own** configured key.
 *
 * This is the half the CMS itself needs. A consumer forwards the token it was
 * given back to the API, and the API has to answer one question: did I issue
 * this, and is it still alive? Which of the two sites it was issued for does
 * not matter here — each consumer only ever forwards its own — so this returns
 * the audience rather than checking it, and the caller may narrow further.
 *
 * Returns `null` for every failure, and never reports which.
 */
export async function verifyOwnLivePreviewToken(
  token: string,
  keyBase64: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<LivePreviewAudience | null> {
  const pair = await getKeys(keyBase64)
  if (!pair) return null

  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const signatureBytes = base64UrlDecode(signature)
  const claimsBytes = base64UrlDecode(body)
  if (!signatureBytes || !claimsBytes) return null

  const valid = await crypto.subtle.verify(
    ALGORITHM,
    pair.verify,
    signatureBytes as BufferSource,
    new TextEncoder().encode(body) as BufferSource,
  )
  if (!valid) return null

  // Decoded only after the signature holds, so nothing downstream ever reads
  // unauthenticated JSON.
  let claims: LivePreviewClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(claimsBytes)) as LivePreviewClaims
  } catch {
    return null
  }

  if (claims.aud !== 'wm-web' && claims.aud !== 'sy-atlas') return null
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null

  return claims.aud
}
