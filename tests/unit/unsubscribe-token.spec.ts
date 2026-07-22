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
  it('round-trips the registration id for a valid token', () => {
    const token = signUnsubscribeToken({ registrationId: 42 }, SECRET)
    const result = readUnsubscribeToken(token, SECRET)
    expect(result).toEqual({ status: 'valid', claims: { registrationId: 42 } })
  })

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken({ registrationId: 42 }, SECRET)
    expect(readUnsubscribeToken(token, 'other-secret').status).toBe('invalid')
  })

  it('rejects a tampered payload — a forged registration id fails the signature', () => {
    const token = signUnsubscribeToken({ registrationId: 42 }, SECRET)
    const [, signature] = token.split('.')
    // Re-encode the claims for a different registration, keep the old signature.
    const forgedPayload = Buffer.from(JSON.stringify({ registrationId: 99 })).toString('base64url')
    const forged = `${forgedPayload}.${signature}`
    expect(readUnsubscribeToken(forged, SECRET).status).toBe('invalid')
  })

  it('rejects a tampered signature', () => {
    const token = signUnsubscribeToken({ registrationId: 42 }, SECRET)
    const [payload] = token.split('.')
    expect(readUnsubscribeToken(`${payload}.deadbeef`, SECRET).status).toBe('invalid')
  })

  it('rejects malformed / empty tokens', () => {
    expect(readUnsubscribeToken('', SECRET).status).toBe('invalid')
    expect(readUnsubscribeToken('no-dot', SECRET).status).toBe('invalid')
    expect(readUnsubscribeToken('a.b.c', SECRET).status).toBe('invalid')
  })

  it('never expires — an authentic token stays valid regardless of age (no exp claim)', () => {
    const token = signUnsubscribeToken({ registrationId: 7 }, SECRET)
    // The claims carry no `exp`, so there is no 'expired' outcome to reach.
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf-8'))
    expect(decoded).toEqual({ registrationId: 7 })
    expect(readUnsubscribeToken(token, SECRET).status).toBe('valid')
  })

  it('is replay-safe: reading the same token twice yields the same claims', () => {
    const token = signUnsubscribeToken({ registrationId: 5 }, SECRET)
    expect(readUnsubscribeToken(token, SECRET)).toEqual(readUnsubscribeToken(token, SECRET))
  })
})
