import { describe, expect, it } from 'vitest'

import {
  signVerifyToken,
  VERIFY_TOKEN_TTL_MS,
  verifyVerifyToken,
} from '@/lib/eventVerification/token'

const SECRET = 'test-payload-secret'
const NOW = new Date('2026-06-11T00:00:00.000Z')

describe('verify token', () => {
  it('round-trips claims through sign → verify', () => {
    const token = signVerifyToken({ eventId: 42, managerId: 7 }, SECRET, NOW)
    expect(verifyVerifyToken(token, SECRET, NOW)).toEqual({ eventId: 42, managerId: 7 })
  })

  it('stays valid up to the 10-day expiry and rejects past it', () => {
    const token = signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
    const justBefore = new Date(NOW.getTime() + VERIFY_TOKEN_TTL_MS - 1000)
    const justAfter = new Date(NOW.getTime() + VERIFY_TOKEN_TTL_MS + 1000)
    expect(verifyVerifyToken(token, SECRET, justBefore)).toEqual({ eventId: 1, managerId: 2 })
    expect(verifyVerifyToken(token, SECRET, justAfter)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
    expect(verifyVerifyToken(token, 'other-secret', NOW)).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const token = signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
    const [, signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ eventId: 999, managerId: 2, exp: NOW.getTime() + VERIFY_TOKEN_TTL_MS }),
    ).toString('base64url')
    expect(verifyVerifyToken(`${forgedPayload}.${signature}`, SECRET, NOW)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyVerifyToken('', SECRET, NOW)).toBeNull()
    expect(verifyVerifyToken('no-dot', SECRET, NOW)).toBeNull()
    expect(verifyVerifyToken('a.b.c', SECRET, NOW)).toBeNull()
  })
})
