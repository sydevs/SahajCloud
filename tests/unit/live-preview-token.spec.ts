import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  LIVE_PREVIEW_TOKEN_TTL_SECONDS,
  livePreviewPublicKey,
  mintLivePreviewToken,
  resetLivePreviewKeyCache,
  verifyLivePreviewToken,
  verifyOwnLivePreviewToken,
  type LivePreviewRole,
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
    expect(await mintLivePreviewToken('wemeditate-web-client', undefined)).toBeNull()
    resetLivePreviewKeyCache()
    expect(await mintLivePreviewToken('wemeditate-web-client', '')).toBeNull()
  })

  it('returns null for a key that is not a usable Ed25519 JWK', async () => {
    expect(await mintLivePreviewToken('wemeditate-web-client', 'not-a-key')).toBeNull()
    resetLivePreviewKeyCache()
    expect(await mintLivePreviewToken('wemeditate-web-client', base64Json({ kty: 'oct', k: 'nope' }))).toBeNull()
  })

  it('mints a two-part token that carries no readable secret', async () => {
    const token = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    expect(token).toBeTruthy()
    expect(token!.split('.')).toHaveLength(2)
    expect(token).not.toContain(privateKeyBase64)
  })

  it('stamps the role and an expiry one TTL ahead', async () => {
    const token = await mintLivePreviewToken('sahaj-atlas-client', privateKeyBase64, NOW)
    const claims = JSON.parse(
      Buffer.from(token!.split('.')[0]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    expect(claims).toEqual({ role: 'sahaj-atlas-client', exp: NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS })
  })
})

describe('verifyLivePreviewToken', () => {
  const verify = (token: string, role: LivePreviewRole = 'wemeditate-web-client', now = NOW) =>
    verifyLivePreviewToken(token, role, publicKeyRaw, now)

  it('accepts a freshly minted token for its own role', async () => {
    const token = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    expect(await verify(token!)).toBe(true)
  })

  it('refuses a token minted for a different client role', async () => {
    // The atlas must not accept a token issued to WeMeditateWeb, and vice
    // versa: one leaked URL should not unlock both surfaces.
    const token = await mintLivePreviewToken('sahaj-atlas-client', privateKeyBase64, NOW)
    expect(await verify(token!, 'wemeditate-web-client')).toBe(false)
  })

  it('refuses a token once it has expired, and at the exact expiry second', async () => {
    const token = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    expect(await verify(token!, 'wemeditate-web-client', NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS - 1)).toBe(true)
    expect(await verify(token!, 'wemeditate-web-client', NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS)).toBe(false)
  })

  it('refuses a token whose claims were edited to extend it', async () => {
    const token = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    const forged = Buffer.from(
      JSON.stringify({ role: 'wemeditate-web-client', exp: NOW + 10_000_000 }),
      'utf8',
    ).toString('base64url')

    expect(await verify(`${forged}.${token!.split('.')[1]}`)).toBe(false)
  })

  it('refuses a token signed by a different key', async () => {
    const token = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    expect(await verifyLivePreviewToken(token!, 'wemeditate-web-client', otherPublicKeyRaw, NOW)).toBe(false)
  })

  it('refuses malformed input without throwing', async () => {
    for (const bad of ['', '.', 'nodot', 'a.b', '....', 'YQ.YQ']) {
      expect(await verify(bad)).toBe(false)
    }
  })
})


/**
 * The half the CMS uses on itself. A consumer forwards the token it was given
 * back to the API, and the API must answer: did I issue this, and is it alive?
 */
describe('verifyOwnLivePreviewToken', () => {
  it('returns the role a valid token was minted for', async () => {
    const wm = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    expect(await verifyOwnLivePreviewToken(wm!, privateKeyBase64, NOW)).toBe('wemeditate-web-client')

    resetLivePreviewKeyCache()
    const atlas = await mintLivePreviewToken('sahaj-atlas-client', privateKeyBase64, NOW)
    expect(await verifyOwnLivePreviewToken(atlas!, privateKeyBase64, NOW)).toBe('sahaj-atlas-client')
  })

  it('accepts any known role — the caller is checked by the hook, not here', async () => {
    // This half answers only "did I issue this, and for whom". Matching the
    // role to the caller is `resolveLivePreviewHook`'s job, where the
    // authenticated key is known.
    const atlas = await mintLivePreviewToken('sahaj-atlas-client', privateKeyBase64, NOW)
    expect(await verifyOwnLivePreviewToken(atlas!, privateKeyBase64, NOW)).not.toBeNull()
  })

  it('refuses a token minted under a different key', async () => {
    const foreign = await mintLivePreviewToken('wemeditate-web-client', otherPrivateKeyBase64, NOW)
    resetLivePreviewKeyCache()
    expect(await verifyOwnLivePreviewToken(foreign!, privateKeyBase64, NOW)).toBeNull()
  })

  it('refuses an expired token, and edited claims', async () => {
    const token = await mintLivePreviewToken('wemeditate-web-client', privateKeyBase64, NOW)
    expect(
      await verifyOwnLivePreviewToken(token!, privateKeyBase64, NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS),
    ).toBeNull()

    const forged = Buffer.from(JSON.stringify({ role: 'wemeditate-web-client', exp: NOW + 9_999_999 })).toString(
      'base64url',
    )
    expect(
      await verifyOwnLivePreviewToken(`${forged}.${token!.split('.')[1]}`, privateKeyBase64, NOW),
    ).toBeNull()
  })

  it('refuses everything when no key is configured', async () => {
    expect(await verifyOwnLivePreviewToken('anything', undefined, NOW)).toBeNull()
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
