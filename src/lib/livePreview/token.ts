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
 * Imports the signing key once per process.
 *
 * Held as the promise, not the resolved key, so concurrent callers share one
 * import rather than racing several. A malformed or absent key resolves to
 * `null` and is cached as such — this is config, so retrying per request would
 * only repeat the same failure at request cost.
 */
let signingKey: Promise<CryptoKey | null> | undefined

async function getSigningKey(privateKeyBase64: string | undefined): Promise<CryptoKey | null> {
  if (!signingKey) {
    signingKey = (async () => {
      if (!privateKeyBase64) return null
      const pkcs8 = base64UrlDecode(privateKeyBase64.replace(/\s/g, ''))
      if (!pkcs8) return null
      try {
        return await crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, ALGORITHM, false, [
          'sign',
        ])
      } catch {
        return null
      }
    })()
  }
  return signingKey
}

/** Test seam: drops the cached key so a spec can swap the configured value. */
export function resetLivePreviewKeyCache(): void {
  signingKey = undefined
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
  privateKeyBase64: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const key = await getSigningKey(privateKeyBase64)
  if (!key) return null

  const claims: LivePreviewClaims = { aud, exp: nowSeconds + LIVE_PREVIEW_TOKEN_TTL_SECONDS }
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)))
  const signature = await crypto.subtle.sign(
    ALGORITHM,
    key,
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
