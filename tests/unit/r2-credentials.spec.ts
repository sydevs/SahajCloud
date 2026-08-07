import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { r2AccessKeyId, r2S3Endpoint, r2SecretAccessKey } from '@/plugins/storage/r2Credentials'

/**
 * R2's S3 API is the only way to reach objects held by an `Object Read & Write`
 * token, and it wants an access-key pair rather than the bearer token. These
 * pin Cloudflare's documented derivation, whose failure mode is an opaque
 * `SignatureDoesNotMatch` rather than anything naming the real cause.
 */
describe('r2SecretAccessKey', () => {
  it('is the hex SHA-256 of the token value', () => {
    // Fixed vector rather than a re-implementation, so a "tidy-up" that swaps
    // the digest encoding has something concrete to fail against.
    expect(r2SecretAccessKey('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('emits hex, never base64', () => {
    const token = 'v1.0-abcdef0123456789'
    const digest = r2SecretAccessKey(token)

    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toBe(createHash('sha256').update(token).digest('base64'))
  })

  it('hashes the token value, never passes it through', () => {
    // Sending the raw token as the secret is the obvious wrong implementation.
    const token = 'v1.0-should-never-appear'
    expect(r2SecretAccessKey(token)).not.toContain(token)
  })
})

/**
 * A jurisdictional bucket addressed on the default host answers `AccessDenied`,
 * not a 404 — so getting this wrong looks like a token-permissions problem and
 * sends you auditing scopes. A live dry run cost exactly that detour.
 */
describe('r2S3Endpoint', () => {
  it('addresses the default host when there is no jurisdiction', () => {
    expect(r2S3Endpoint('abc123')).toBe('https://abc123.r2.cloudflarestorage.com')
    expect(r2S3Endpoint('abc123', undefined)).toBe('https://abc123.r2.cloudflarestorage.com')
    // Unset env arrives as '' rather than undefined.
    expect(r2S3Endpoint('abc123', '')).toBe('https://abc123.r2.cloudflarestorage.com')
  })

  it('infixes the jurisdiction when there is one', () => {
    expect(r2S3Endpoint('abc123', 'eu')).toBe('https://abc123.eu.r2.cloudflarestorage.com')
    expect(r2S3Endpoint('abc123', 'fedramp')).toBe(
      'https://abc123.fedramp.r2.cloudflarestorage.com',
    )
  })

  it('rejects an unknown jurisdiction rather than building a dead host', () => {
    // `europe` would otherwise yield a plausible URL that fails at DNS.
    expect(() => r2S3Endpoint('abc123', 'europe')).toThrow(/Unknown R2 jurisdiction/)
  })
})

/**
 * Cloudflare issues account-owned and user-owned tokens, each verifiable under
 * one scope only, and asking the wrong one answers `Invalid API Token` — which
 * is indistinguishable from a genuinely bad token. A live dry run caught this:
 * the token worked for Images and Stream but the id lookup rejected it.
 *
 * `cfGet` is injected rather than stubbing global fetch, per `.claude/rules/tests.md`.
 */
describe('r2AccessKeyId', () => {
  const ACCOUNT = 'acct-1'
  const ACCOUNT_SCOPE = `/accounts/${ACCOUNT}/tokens/verify`
  const USER_SCOPE = '/user/tokens/verify'
  const invalid = { success: false, errors: [{ code: 1000, message: 'Invalid API Token' }] }
  const valid = (id: string) => ({ success: true, result: { id, status: 'active' } })

  /** Records the paths tried, answering `valid` only for `respondsAt`. */
  const cfGet = (respondsAt: string | null, id = 'tok-id') => {
    const tried: string[] = []
    const get = async (path: string) => {
      tried.push(path)
      return path === respondsAt ? valid(id) : invalid
    }
    return { get, tried }
  }

  it('resolves an account-owned token', async () => {
    const { get, tried } = cfGet(ACCOUNT_SCOPE, 'acct-token-id')
    await expect(r2AccessKeyId(ACCOUNT, get)).resolves.toBe('acct-token-id')
    // Account scope is tried first — it's the kind Cloudflare recommends for
    // services, so the common case shouldn't pay for a wasted round trip.
    expect(tried).toEqual([ACCOUNT_SCOPE])
  })

  it('falls back to the user scope when the account scope rejects it', async () => {
    const { get, tried } = cfGet(USER_SCOPE, 'user-token-id')
    await expect(r2AccessKeyId(ACCOUNT, get)).resolves.toBe('user-token-id')
    expect(tried).toEqual([ACCOUNT_SCOPE, USER_SCOPE])
  })

  it('throws only after both scopes reject it, naming both', async () => {
    const { get, tried } = cfGet(null)
    await expect(r2AccessKeyId(ACCOUNT, get)).rejects.toThrow(/tokens\/verify/)
    expect(tried).toEqual([ACCOUNT_SCOPE, USER_SCOPE])
  })

  it('treats a success with no result as a rejection, not an empty key', async () => {
    // Would otherwise hand the S3 client `undefined` as its access key.
    const get = async () => ({ success: true, result: null })
    await expect(r2AccessKeyId(ACCOUNT, get)).rejects.toThrow()
  })

  it('treats an empty id as a rejection', async () => {
    const get = async () => ({ success: true, result: { id: '' } })
    await expect(r2AccessKeyId(ACCOUNT, get)).rejects.toThrow()
  })
})
