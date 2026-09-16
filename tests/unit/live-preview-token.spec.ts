import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  LIVE_PREVIEW_TOKEN_TTL_SECONDS,
  livePreviewPublicKey,
  mintLivePreviewToken,
  resetLivePreviewKeyCache,
  verifyLivePreviewToken,
  verifyOwnLivePreviewToken,
} from '@/lib/livePreview/token'

/**
 * The reference implementation of the token format.
 *
 * Both consumers verify these tokens with their own copy of the check — neither
 * imports from this repo — so this file is where the format is pinned. A change
 * that breaks a consumer breaks a case here first.
 */

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

const NOW = 1_800_000_000

/**
 * The expiry a mint at `now` produces. Bucketed, not `now + TTL`, so that two
 * mints in the same window are byte-identical — see the `token stability`
 * block for why that matters.
 */
const expectedExp = (now: number) =>
  (Math.floor(now / LIVE_PREVIEW_TOKEN_TTL_SECONDS) + 2) * LIVE_PREVIEW_TOKEN_TTL_SECONDS

let privateKeyBase64: string
let otherPrivateKeyBase64: string
let publicKeyRaw: Uint8Array
let otherPublicKeyRaw: Uint8Array

/** The configured-key format: base64 of the private JWK. */
async function jwkKey(key: CryptoKey): Promise<string> {
  return Buffer.from(JSON.stringify(await crypto.subtle.exportKey('jwk', key)), 'utf8').toString(
    'base64',
  )
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  privateKeyBase64 = await jwkKey(pair.privateKey)
  publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))

  const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  otherPrivateKeyBase64 = await jwkKey(other.privateKey)
  otherPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', other.publicKey))
})

beforeEach(() => {
  resetLivePreviewKeyCache()
})

describe('mintLivePreviewToken', () => {
  it('returns null when no signing key is configured', async () => {
    // Not an error: an environment with no key renders the admin panel and
    // simply does not offer live preview.
    expect(await mintLivePreviewToken(undefined)).toBeNull()
    resetLivePreviewKeyCache()
    expect(await mintLivePreviewToken('')).toBeNull()
  })

  it('returns null for a key that is not a usable Ed25519 JWK', async () => {
    expect(await mintLivePreviewToken('not-a-key')).toBeNull()
    resetLivePreviewKeyCache()
    expect(await mintLivePreviewToken(base64Json({ kty: 'oct', k: 'nope' }))).toBeNull()
  })

  it('mints a compact JWS that carries no readable secret', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    expect(token).toBeTruthy()
    expect(token!.split('.')).toHaveLength(3)
    expect(token).not.toContain(privateKeyBase64)
  })

  it('pins EdDSA in the header and carries a bucketed expiry as its only claim', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    const [header, payload] = token!.split('.')
    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

    expect(decode(header!)).toEqual({ alg: 'EdDSA' })
    expect(decode(payload!)).toEqual({ exp: expectedExp(NOW) })
  })
})

/**
 * ⚠ **Stability is a feature, not an accident of the algorithm.**
 *
 * Payload compares the live-preview URL by value and reassigns the iframe's
 * `src` whenever it changes. The URL re-resolves on every save, and `pages`
 * autosaves every 60s — so a token that varied per mint would reload the panel
 * every minute: scroll lost, `appIsReady` reset, the postMessage stream stalled
 * until the consumer re-announces `ready`.
 */
describe('token stability', () => {
  it('is byte-identical for two mints inside the same window', async () => {
    const a = await mintLivePreviewToken(privateKeyBase64, NOW)
    const b = await mintLivePreviewToken(privateKeyBase64, NOW + 59)

    expect(a).toBe(b)
  })

  it('is still identical a full autosave interval later', async () => {
    // 60s is `pages`' autosave interval — the exact case that would have
    // reloaded the iframe once a minute.
    const a = await mintLivePreviewToken(privateKeyBase64, NOW)
    const b = await mintLivePreviewToken(privateKeyBase64, NOW + 60)

    expect(a).toBe(b)
  })

  it('still expires, and lives at least one TTL from any mint', async () => {
    // Bucketing must not turn a short-lived credential into a long-lived one.
    // Worst case is the last second of a bucket: one TTL of life remains.
    const atBucketEnd =
      (Math.floor(NOW / LIVE_PREVIEW_TOKEN_TTL_SECONDS) + 1) * LIVE_PREVIEW_TOKEN_TTL_SECONDS - 1
    const token = await mintLivePreviewToken(privateKeyBase64, atBucketEnd)

    expect(
      await verifyLivePreviewToken(
        token!,
        publicKeyRaw,
        atBucketEnd + LIVE_PREVIEW_TOKEN_TTL_SECONDS - 1,
      ),
    ).toBe(true)

    // And never more than two.
    expect(
      await verifyLivePreviewToken(
        token!,
        publicKeyRaw,
        atBucketEnd + 2 * LIVE_PREVIEW_TOKEN_TTL_SECONDS,
      ),
    ).toBe(false)
  })
})

describe('verifyLivePreviewToken', () => {
  const verify = (token: string, now = NOW) => verifyLivePreviewToken(token, publicKeyRaw, now)

  it('accepts a freshly minted token', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    expect(await verify(token!)).toBe(true)
  })

  it('refuses a token once it has expired, and at the exact expiry second', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    const exp = expectedExp(NOW)

    expect(await verify(token!, exp - 1)).toBe(true)
    expect(await verify(token!, exp)).toBe(false)
  })

  it('refuses a token whose claims were edited to extend it', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    const [header, , signature] = token!.split('.')
    const forged = Buffer.from(JSON.stringify({ exp: NOW + 10_000_000 }), 'utf8').toString(
      'base64url',
    )

    expect(await verify(`${header}.${forged}.${signature}`)).toBe(false)
  })

  it('refuses a token signed by a different key', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    expect(await verifyLivePreviewToken(token!, otherPublicKeyRaw, NOW)).toBe(false)
  })

  it('refuses an unsigned token claiming `alg: none`', async () => {
    // The algorithm is pinned on verify, so a token cannot nominate its own —
    // the classic JWS downgrade, and the reason not to hand-roll this check.
    const part = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

    expect(await verify(`${part({ alg: 'none' })}.${part({ exp: NOW + 10_000 })}.`)).toBe(false)
  })

  it('refuses malformed input without throwing', async () => {
    for (const bad of ['', '.', 'nodot', 'a.b', '....', 'YQ.YQ', 'a.b.c']) {
      expect(await verify(bad)).toBe(false)
    }
  })
})

/**
 * The half the CMS uses on itself. A consumer forwards the token it was given
 * back to the API, and the API must answer: did I issue this, and is it alive?
 */
describe('verifyOwnLivePreviewToken', () => {
  it('accepts a token minted under the configured key', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    expect(await verifyOwnLivePreviewToken(token!, privateKeyBase64, NOW)).toBe(true)
  })

  it('refuses a token minted under a different key', async () => {
    const foreign = await mintLivePreviewToken(otherPrivateKeyBase64, NOW)
    resetLivePreviewKeyCache()
    expect(await verifyOwnLivePreviewToken(foreign!, privateKeyBase64, NOW)).toBe(false)
  })

  it('refuses an expired token, and edited claims', async () => {
    const token = await mintLivePreviewToken(privateKeyBase64, NOW)
    expect(await verifyOwnLivePreviewToken(token!, privateKeyBase64, expectedExp(NOW))).toBe(false)

    const [header, , signature] = token!.split('.')
    const forged = Buffer.from(JSON.stringify({ exp: NOW + 9_999_999 }), 'utf8').toString(
      'base64url',
    )
    expect(
      await verifyOwnLivePreviewToken(`${header}.${forged}.${signature}`, privateKeyBase64, NOW),
    ).toBe(false)
  })

  it('refuses malformed input, and everything when no key is configured', async () => {
    expect(await verifyOwnLivePreviewToken('anything', undefined, NOW)).toBe(false)
    resetLivePreviewKeyCache()
    expect(await verifyOwnLivePreviewToken('not.a.token', privateKeyBase64, NOW)).toBe(false)
  })
})

describe('livePreviewPublicKey', () => {
  it('derives the same public key the consumers verify with', async () => {
    // One configured variable yields both halves, so the key a consumer is
    // handed cannot drift from the key that signs.
    const derived = await livePreviewPublicKey(privateKeyBase64)
    expect(derived).not.toBeNull()
    expect(Buffer.from(derived!).toString('base64')).toBe(
      Buffer.from(publicKeyRaw).toString('base64'),
    )
  })

  it('is null when no key is configured', async () => {
    expect(await livePreviewPublicKey(undefined)).toBeNull()
  })
})
