import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { r2S3Endpoint, r2SecretAccessKey } from '@/plugins/storage/r2Credentials'

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

describe('r2S3Endpoint', () => {
  it('addresses the account bucket host', () => {
    expect(r2S3Endpoint('abc123')).toBe('https://abc123.r2.cloudflarestorage.com')
  })
})
