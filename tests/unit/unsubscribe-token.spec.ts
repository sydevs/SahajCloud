/**
 * Unit tests for the registration unsubscribe token.
 *
 * Pure HMAC signing — no Payload, no DB. Covers the AC that the token cannot be
 * forged or replayed to affect another registration.
 */
import { describe, expect, it } from 'vitest'

import { readUnsubscribeToken, signUnsubscribeToken } from '@/lib/registrations/unsubscribeToken'

const SECRET = 'test-secret-abc'

describe('unsubscribe token', () => {
  it('round-trips the registration id for a valid token', async () => {
    const token = await signUnsubscribeToken({ registrationId: 42 }, SECRET)
    const result = await readUnsubscribeToken(token, SECRET)
    expect(result).toEqual({ status: 'valid', claims: { registrationId: 42 } })
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signUnsubscribeToken({ registrationId: 42 }, SECRET)
    expect((await readUnsubscribeToken(token, 'other-secret')).status).toBe('invalid')
  })

  it('rejects a tampered payload — a forged registration id fails the signature', async () => {
    const token = await signUnsubscribeToken({ registrationId: 42 }, SECRET)
    const [header, , signature] = token.split('.')
    // Re-encode the claims for a different registration, keep the old signature.
    const forged = Buffer.from(JSON.stringify({ registrationId: 99 })).toString('base64url')
    expect((await readUnsubscribeToken(`${header}.${forged}.${signature}`, SECRET)).status).toBe(
      'invalid',
    )
  })

  it('rejects a tampered signature', async () => {
    const token = await signUnsubscribeToken({ registrationId: 42 }, SECRET)
    const [header, payloadB64] = token.split('.')
    expect(
      (await readUnsubscribeToken(`${header}.${payloadB64}.deadbeef`, SECRET)).status,
    ).toBe('invalid')
  })

  it('rejects malformed / empty tokens', async () => {
    expect((await readUnsubscribeToken('', SECRET)).status).toBe('invalid')
    expect((await readUnsubscribeToken('no-dot', SECRET)).status).toBe('invalid')
    expect((await readUnsubscribeToken('a.b.c', SECRET)).status).toBe('invalid')
  })

  it('never expires — an authentic token stays valid regardless of age (no exp claim)', async () => {
    const token = await signUnsubscribeToken({ registrationId: 7 }, SECRET)
    // No `exp` in the JWT payload, so there is no 'expired' outcome to reach.
    // Asserted on the absence of that claim rather than the whole payload: the
    // rest (`aud`, `iat`) is the shared helper's business, not this link's.
    const [, payloadB64] = token.split('.')
    const decoded = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf-8'))
    expect(decoded.exp).toBeUndefined()
    expect(decoded.registrationId).toBe(7)
    expect((await readUnsubscribeToken(token, SECRET)).status).toBe('valid')
  })

  it('is replay-safe: reading the same token twice yields the same claims', async () => {
    const token = await signUnsubscribeToken({ registrationId: 5 }, SECRET)
    expect(await readUnsubscribeToken(token, SECRET)).toEqual(await readUnsubscribeToken(token, SECRET))
  })
})
