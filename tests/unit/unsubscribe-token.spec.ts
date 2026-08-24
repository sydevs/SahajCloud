/**
 * Unit tests for the registration unsubscribe token.
 *
 * Pure HMAC signing — no Payload, no DB. Covers the AC that the token cannot be
 * forged or replayed to affect another registration.
 */
import { createHmac } from 'node:crypto'

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
    // The envelope carries no `exp`, so there is no 'expired' outcome to reach.
    // Asserted on the absence of the claim rather than the whole payload shape:
    // the shape is the shared helper's business and has already changed once.
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf-8'))
    expect(decoded.exp).toBeUndefined()
    expect(decoded.claims).toEqual({ registrationId: 7 })
    expect(readUnsubscribeToken(token, SECRET).status).toBe('valid')
  })

  it('still reads a token minted before the shared-helper consolidation', () => {
    // These never expire, so every reminder email ever sent still holds one —
    // and what they authorize is *stopping email*. A 404 here means someone
    // who wants out reports the message as spam instead.
    const legacy = Buffer.from(JSON.stringify({ registrationId: 7 })).toString('base64url')
    const signature = createHmac('sha256', SECRET).update(legacy).digest('base64url')
    expect(readUnsubscribeToken(`${legacy}.${signature}`, SECRET)).toEqual({
      status: 'valid',
      claims: { registrationId: 7 },
    })
  })

  it('rejects a legacy-shaped token whose signature does not match', () => {
    const legacy = Buffer.from(JSON.stringify({ registrationId: 7 })).toString('base64url')
    const forged = createHmac('sha256', 'not-the-secret').update(legacy).digest('base64url')
    expect(readUnsubscribeToken(`${legacy}.${forged}`, SECRET).status).toBe('invalid')
  })

  it('is replay-safe: reading the same token twice yields the same claims', () => {
    const token = signUnsubscribeToken({ registrationId: 5 }, SECRET)
    expect(readUnsubscribeToken(token, SECRET)).toEqual(readUnsubscribeToken(token, SECRET))
  })
})
