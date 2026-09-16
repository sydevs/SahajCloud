/**
 * Live-preview tokens — the credential the admin panel puts on a preview URL.
 *
 * The CMS signs and the consumers verify, so only this service holds a key that
 * can mint. That is what a shared `SAHAJCLOUD_PREVIEW_SECRET` could never do:
 * it rode on the URL, where browser history, `Referer`, Sentry session replay
 * and an analytics script that posts `location.href` all read it, and a public
 * bundle like the atlas widget cannot be given a symmetric key to check it with
 * — holding one means being able to mint one.
 *
 * ## The crypto is `jose`'s, not ours
 *
 * Same call as `lib/utilities/signedToken.ts`, for the same reasons: `jose` is
 * already in the tree as Payload's own dependency, the algorithm is pinned on
 * verify so a token cannot talk us into `none`, and `exp` is checked by the
 * library against an injectable clock.
 *
 * ## What the token binds
 *
 * `{ exp }`, and nothing else.
 *
 * ⚠ **There is deliberately no audience claim.** One named the API-client role
 * that could redeem the token, and it was dropped in #788: the client key on
 * the request already decides which collections are readable, so the claim only
 * narrowed which *surface* a leaked token unlocked drafts on, never what it
 * could reach. Path binding was rejected earlier for breaking on
 * WeMeditateWeb's `/en/*` redirect, the atlas's in-app navigation and a slug
 * renamed mid-edit — each a silent preview failure rather than an error.
 *
 * ⚠ **This is a bearer credential for draft content, not an identity.** It says
 * "the CMS issued this, recently", never "who". Anything needing attribution
 * wants a session, not this.
 */

import { base64url, importJWK, jwtVerify, SignJWT, type JWK, type KeyLike } from 'jose'

/**
 * How long a freshly minted token lives.
 *
 * Long enough that an editor does not lose the panel mid-sentence — the URL
 * re-resolves on save, so a working session keeps renewing it — and short
 * enough that a leaked one is worthless by the time anyone reads the log it
 * landed in.
 */
export const LIVE_PREVIEW_TOKEN_TTL_SECONDS = 45 * 60

/**
 * The JWS algorithm, pinned on both halves.
 *
 * ⚠ Not the same spelling as the Web Crypto algorithm, which is `Ed25519`. A
 * consumer importing a raw key needs that name; `jwtVerify` needs this one.
 */
const ALGORITHM = 'EdDSA'

/**
 * The configured key pair, imported once per process.
 *
 * ⚠ **The key is a JWK, not PKCS8.** A PKCS8 private key cannot yield its own
 * public half, and this service needs both: it mints tokens for the panel and
 * verifies them again when a consumer forwards one back. A JWK carries `x`
 * beside `d`, so one variable gives both and they cannot drift out of step —
 * which two variables would eventually do, in a way that looks exactly like a
 * forged token.
 *
 * Held as the promise, not the resolved keys, so concurrent callers share one
 * import. A malformed or absent key resolves to `null` and is cached as such:
 * this is config, so retrying per request would repeat the same failure at
 * request cost.
 */
interface LivePreviewKeys {
  sign: KeyLike | Uint8Array
  verify: KeyLike | Uint8Array
  /** Raw 32-byte public key — `x` is exactly that, base64url-encoded. */
  publicRaw: Uint8Array
}

let keys: Promise<LivePreviewKeys | null> | undefined

async function getKeys(keyBase64: string | undefined): Promise<LivePreviewKeys | null> {
  keys ??= (async () => {
    if (!keyBase64) return null

    try {
      const jwk = JSON.parse(atob(keyBase64.replace(/\s/g, ''))) as JWK
      // `key_ops` and `ext` describe the private key, and importing a verify
      // key that still claims `sign` is refused.
      const { d: _d, key_ops: _ops, ext: _ext, ...publicJwk } = jwk
      if (!publicJwk.x) return null

      return {
        sign: await importJWK(jwk, ALGORITHM),
        verify: await importJWK(publicJwk, ALGORITHM),
        publicRaw: base64url.decode(publicJwk.x),
      }
    } catch {
      return null
    }
  })()

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
  return (await getKeys(keyBase64))?.publicRaw ?? null
}

/**
 * Mints a token, or `null` when no signing key is configured.
 *
 * ⚠ **`null` is a supported outcome, not an error.** An environment with no key
 * — a fresh checkout, a preview deploy that never had the variable — should
 * render the admin panel and simply not offer live preview.
 */
export async function mintLivePreviewToken(
  keyBase64: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const pair = await getKeys(keyBase64)
  if (!pair) return null

  // ⚠ **The expiry is bucketed, and there is no `iat`, so that consecutive
  // mints are byte-identical.** Payload compares the preview URL by value and
  // reassigns the iframe's `src` when it changes, and re-resolves that URL on
  // every save — `pages` autosaves every 60s. Any per-second claim would
  // therefore reload the panel each minute: scroll position lost, `appIsReady`
  // reset, the postMessage stream stalled until the consumer re-announces
  // `ready`. A token lives between one and two TTLs as a result.
  const bucket = Math.floor(nowSeconds / LIVE_PREVIEW_TOKEN_TTL_SECONDS)

  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setExpirationTime((bucket + 2) * LIVE_PREVIEW_TOKEN_TTL_SECONDS)
    .sign(pair.sign)
}

/**
 * Verifies a token against a raw 32-byte Ed25519 public key — the shape a
 * consumer holds.
 *
 * Lives here, beside the minter, so this repo's own specs can prove a minted
 * token verifies. Both consumers carry their own copy of this check, because
 * neither imports from this repo; `tests/unit/live-preview-token.spec.ts` is
 * the shared reference.
 *
 * Returns false for every failure and never says which. A caller learning *why*
 * its token was refused learns how to forge a better one.
 */
export async function verifyLivePreviewToken(
  token: string,
  publicKeyRaw: Uint8Array,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKeyRaw as BufferSource,
      'Ed25519',
      false,
      ['verify'],
    )

    await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      currentDate: new Date(nowSeconds * 1000),
    })

    return true
  } catch {
    return false
  }
}

/**
 * Verifies a token against **this service's own** configured key — the half the
 * CMS needs when a consumer forwards one back to the API.
 */
export async function verifyOwnLivePreviewToken(
  token: string,
  keyBase64: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const pair = await getKeys(keyBase64)
  if (!pair) return false

  try {
    await jwtVerify(token, pair.verify, {
      algorithms: [ALGORITHM],
      currentDate: new Date(nowSeconds * 1000),
    })

    return true
  } catch {
    return false
  }
}
