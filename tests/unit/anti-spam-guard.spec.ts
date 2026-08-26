import { describe, expect, it } from 'vitest'


import { checkEmailAllowed, checkNoUrls } from '@/lib/endpoints/antiSpamGuard'
import { signToken, verifyToken } from '@/lib/utilities/signedToken'

const NOW = new Date('2026-08-11T12:00:00.000Z')

describe('checkNoUrls', () => {
  it.each([
    'visit https://spam.example now',
    'visit http://spam.example now',
    'go to www.spam-site.org',
    'find us at classes.com today',
    'shady.xyz has details',
  ])('rejects %s', (text) => {
    const result = checkNoUrls({ description: text })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('urls_not_allowed')
      expect(result.field).toBe('description')
    }
  })

  it.each([
    'meet at 7pm.Meditation starts promptly',
    'e.g. bring a cushion',
    'the class is free',
    'St. Mary’s hall',
  ])('passes ordinary prose: %s', (text) => {
    expect(checkNoUrls({ description: text }).ok).toBe(true)
  })

  it('ignores non-string values and names the offending field', async () => {
    const result = checkNoUrls({ count: 3, note: 'see www.spam.biz', other: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.field).toBe('note')
  })
})

describe('checkEmailAllowed', () => {
  it('passes a real address and a nullish one (optional fields stay optional)', async () => {
    expect(checkEmailAllowed('person@gmail.com').ok).toBe(true)
    expect(checkEmailAllowed(null).ok).toBe(true)
    expect(checkEmailAllowed(undefined).ok).toBe(true)
    expect(checkEmailAllowed('').ok).toBe(true)
  })

  it('rejects a malformed address as invalid_email', async () => {
    const result = checkEmailAllowed('not-an-email')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_email')
  })

  it('rejects a disposable-domain address as disposable_email', async () => {
    const result = checkEmailAllowed('throwaway@mailinator.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('disposable_email')
  })
})

describe('signedToken', () => {
  const SECRET = 'test-secret'
  const OPTIONS = { kind: 'unit-test', ttlMs: 1000 * 60 }

  it('round-trips claims within the TTL', async () => {
    const token = await signToken({ submissionId: 7, managerId: null }, OPTIONS, SECRET, NOW)
    const result = await verifyToken<{ submissionId: number }>(token, 'unit-test', SECRET, NOW)
    expect(result.status).toBe('valid')
    if (result.status === 'valid') expect(result.claims.submissionId).toBe(7)
  })

  it('reports an authentic-but-aged token as expired', async () => {
    const token = await signToken({ id: 1 }, OPTIONS, SECRET, NOW)
    const later = new Date(NOW.getTime() + OPTIONS.ttlMs + 1)
    expect((await verifyToken(token, 'unit-test', SECRET, later)).status).toBe('expired')
  })

  it('rejects a kind mismatch — one link type can never replay as another', async () => {
    const token = await signToken({ id: 1 }, OPTIONS, SECRET, NOW)
    expect((await verifyToken(token, 'other-kind', SECRET, NOW)).status).toBe('invalid')
  })

  it('rejects tampered and malformed tokens', async () => {
    const token = await signToken({ id: 1 }, OPTIONS, SECRET, NOW)
    expect((await verifyToken(`${token}x`, 'unit-test', SECRET, NOW)).status).toBe('invalid')
    expect((await verifyToken('garbage', 'unit-test', SECRET, NOW)).status).toBe('invalid')
    expect((await verifyToken(null, 'unit-test', SECRET, NOW)).status).toBe('invalid')
  })
})
