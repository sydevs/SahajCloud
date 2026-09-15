import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  LIVE_PREVIEW_TOKEN_TTL_SECONDS,
  mintLivePreviewToken,
  resetLivePreviewKeyCache,
  verifyLivePreviewToken,
} from '@/lib/livePreview/token'

/**
 * The reference implementation of the token format.
 *
 * Both consumers verify these tokens with their own copy of the check — neither
 * imports from this repo — so this file is where the format is pinned. A change
 * that breaks a consumer breaks a case here first.
 */

function base64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64')
}

const NOW = 1_800_000_000

let privateKeyBase64: string
let publicKeyRaw: Uint8Array
let otherPublicKeyRaw: Uint8Array

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  privateKeyBase64 = base64(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))

  const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  otherPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', other.publicKey))
})

beforeEach(() => {
  resetLivePreviewKeyCache()
})

describe('mintLivePreviewToken', () => {
  it('returns null when no signing key is configured', async () => {
    // Not an error: an environment with no key renders the admin panel and
    // simply does not offer live preview.
    expect(await mintLivePreviewToken('wm-web', undefined)).toBeNull()
    resetLivePreviewKeyCache()
    expect(await mintLivePreviewToken('wm-web', '')).toBeNull()
  })

  it('returns null for a key that is not a usable PKCS8 Ed25519 key', async () => {
    expect(await mintLivePreviewToken('wm-web', 'not-a-key')).toBeNull()
  })

  it('mints a two-part token that carries no readable secret', async () => {
    const token = await mintLivePreviewToken('wm-web', privateKeyBase64, NOW)
    expect(token).toBeTruthy()
    expect(token!.split('.')).toHaveLength(2)
    expect(token).not.toContain(privateKeyBase64)
  })

  it('stamps the audience and an expiry one TTL ahead', async () => {
    const token = await mintLivePreviewToken('sy-atlas', privateKeyBase64, NOW)
    const claims = JSON.parse(
      Buffer.from(token!.split('.')[0]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    expect(claims).toEqual({ aud: 'sy-atlas', exp: NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS })
  })
})

describe('verifyLivePreviewToken', () => {
  const verify = (token: string, aud: 'wm-web' | 'sy-atlas' = 'wm-web', now = NOW) =>
    verifyLivePreviewToken(token, aud, publicKeyRaw, now)

  it('accepts a freshly minted token for its own audience', async () => {
    const token = await mintLivePreviewToken('wm-web', privateKeyBase64, NOW)
    expect(await verify(token!)).toBe(true)
  })

  it('refuses a token minted for the other site', async () => {
    // The atlas must not accept a token issued to WeMeditateWeb, and vice
    // versa: one leaked URL should not unlock both surfaces.
    const token = await mintLivePreviewToken('sy-atlas', privateKeyBase64, NOW)
    expect(await verify(token!, 'wm-web')).toBe(false)
  })

  it('refuses a token once it has expired, and at the exact expiry second', async () => {
    const token = await mintLivePreviewToken('wm-web', privateKeyBase64, NOW)
    expect(await verify(token!, 'wm-web', NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS - 1)).toBe(true)
    expect(await verify(token!, 'wm-web', NOW + LIVE_PREVIEW_TOKEN_TTL_SECONDS)).toBe(false)
  })

  it('refuses a token whose claims were edited to extend it', async () => {
    const token = await mintLivePreviewToken('wm-web', privateKeyBase64, NOW)
    const forged = Buffer.from(
      JSON.stringify({ aud: 'wm-web', exp: NOW + 10_000_000 }),
      'utf8',
    ).toString('base64url')

    expect(await verify(`${forged}.${token!.split('.')[1]}`)).toBe(false)
  })

  it('refuses a token signed by a different key', async () => {
    const token = await mintLivePreviewToken('wm-web', privateKeyBase64, NOW)
    expect(await verifyLivePreviewToken(token!, 'wm-web', otherPublicKeyRaw, NOW)).toBe(false)
  })

  it('refuses malformed input without throwing', async () => {
    for (const bad of ['', '.', 'nodot', 'a.b', '....', 'YQ.YQ']) {
      expect(await verify(bad)).toBe(false)
    }
  })
})
