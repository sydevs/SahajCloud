import { describe, expect, it } from 'vitest'

import {
  readVerifyToken,
  signVerifyToken,
  VERIFY_TOKEN_TTL_MS,
  verifyVerifyToken,
} from '@/lib/eventVerification/token'
import { signToken } from '@/lib/utilities/signedToken'

const SECRET = 'test-payload-secret'
const NOW = new Date('2026-06-11T00:00:00.000Z')

describe('verify token', () => {
  it('round-trips claims through sign → verify', async () => {
    const token = await signVerifyToken({ eventId: 42, managerId: 7 }, SECRET, NOW)
    expect(await verifyVerifyToken(token, SECRET, NOW)).toEqual({ eventId: 42, managerId: 7 })
  })

  it('stays valid up to the 10-day expiry and rejects past it', async () => {
    const token = await signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
    const justBefore = new Date(NOW.getTime() + VERIFY_TOKEN_TTL_MS - 1000)
    const justAfter = new Date(NOW.getTime() + VERIFY_TOKEN_TTL_MS + 1000)
    expect(await verifyVerifyToken(token, SECRET, justBefore)).toEqual({ eventId: 1, managerId: 2 })
    expect(await verifyVerifyToken(token, SECRET, justAfter)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
    expect(await verifyVerifyToken(token, 'other-secret', NOW)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    // Keep the real header and signature, swap the claims for another event —
    // three parts, so this is a well-formed JWT that only the signature refuses.
    const token = await signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
    const [header, , signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ eventId: 999, managerId: 2, aud: 'event-verify' }),
    ).toString('base64url')
    expect(await verifyVerifyToken(`${header}.${forged}.${signature}`, SECRET, NOW)).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyVerifyToken('', SECRET, NOW)).toBeNull()
    expect(await verifyVerifyToken('no-dot', SECRET, NOW)).toBeNull()
    expect(await verifyVerifyToken('a.b.c', SECRET, NOW)).toBeNull()
  })

  it('refuses a token signed for another link type', async () => {
    // The kind travels as the JWT audience, which `jwtVerify` checks before any
    // claim is read — so a feedback link can never be spent as a verify link.
    const other = await signToken({ eventId: 1, managerId: 2 }, { kind: 'other', ttlMs: 60_000 }, SECRET, NOW)
    expect(await verifyVerifyToken(other, SECRET, NOW)).toBeNull()
  })

  describe('readVerifyToken (discriminated)', () => {
    it('returns valid + claims for a genuine, unexpired token', async () => {
      const token = await signVerifyToken({ eventId: 42, managerId: 7 }, SECRET, NOW)
      expect(await readVerifyToken(token, SECRET, NOW)).toEqual({
        status: 'valid',
        claims: { eventId: 42, managerId: 7 },
      })
    })

    it('distinguishes an authentic-but-expired token as expired (not invalid)', async () => {
      const token = await signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
      const justAfter = new Date(NOW.getTime() + VERIFY_TOKEN_TTL_MS + 1000)
      expect(await readVerifyToken(token, SECRET, justAfter)).toEqual({ status: 'expired' })
    })

    it('reports invalid for missing / malformed / wrong-secret / tampered tokens', async () => {
      const token = await signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW)
      expect(await readVerifyToken('', SECRET, NOW)).toEqual({ status: 'invalid' })
      expect(await readVerifyToken('no-dot', SECRET, NOW)).toEqual({ status: 'invalid' })
      expect(await readVerifyToken(token, 'other-secret', NOW)).toEqual({ status: 'invalid' })
      const [header, , signature] = token.split('.')
      const forged = Buffer.from(
        JSON.stringify({ eventId: 999, managerId: 2, aud: 'event-verify' }),
      ).toString('base64url')
      expect(await readVerifyToken(`${header}.${forged}.${signature}`, SECRET, NOW)).toEqual({
        status: 'invalid',
      })
    })
  })
})
