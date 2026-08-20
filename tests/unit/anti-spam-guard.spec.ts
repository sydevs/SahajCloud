import { describe, expect, it } from 'vitest'


import {
  antiSpamErrorResponse,
  checkEmailAllowed,
  checkNoUrls,
} from '@/lib/endpoints/antiSpamGuard'
import { signToken, verifyToken } from '@/lib/utilities/signedToken'
import type { EventSubmission } from '@/payload-types'

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

  it('ignores non-string values and names the offending field', () => {
    const result = checkNoUrls({ count: 3, note: 'see www.spam.biz', other: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.field).toBe('note')
  })
})

describe('checkEmailAllowed', () => {
  it('passes a real address and a nullish one (optional fields stay optional)', () => {
    expect(checkEmailAllowed('person@gmail.com').ok).toBe(true)
    expect(checkEmailAllowed(null).ok).toBe(true)
    expect(checkEmailAllowed(undefined).ok).toBe(true)
    expect(checkEmailAllowed('').ok).toBe(true)
  })

  it('rejects a malformed address as invalid_email', () => {
    const result = checkEmailAllowed('not-an-email')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_email')
  })

  it('rejects a disposable-domain address as disposable_email', () => {
    const result = checkEmailAllowed('throwaway@mailinator.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('disposable_email')
  })
})

describe('antiSpamErrorResponse', () => {
  it('ships the machine code on client-actionable failures', async () => {
    const response = antiSpamErrorResponse({
      ok: false,
      code: 'captcha_failed',
      status: 403,
      message: 'Captcha verification failed.',
    })
    expect(response.status).toBe(403)
    const body = (await response.json()) as { errors: { code?: string }[] }
    expect(body.errors[0].code).toBe('captcha_failed')
  })

  it('withholds the code on our own 500 (pinned contactAdmin contract)', async () => {
    const response = antiSpamErrorResponse({
      ok: false,
      code: 'captcha_unavailable',
      status: 500,
      message: 'Could not verify the captcha.',
    })
    expect(response.status).toBe(500)
    const body = (await response.json()) as { errors: { code?: string }[] }
    expect(body.errors[0].code).toBeUndefined()
  })
})

describe('signedToken', () => {
  const SECRET = 'test-secret'
  const OPTIONS = { kind: 'unit-test', ttlMs: 1000 * 60 }

  it('round-trips claims within the TTL', () => {
    const token = signToken({ submissionId: 7, managerId: null }, OPTIONS, SECRET, NOW)
    const result = verifyToken<{ submissionId: number }>(token, 'unit-test', SECRET, NOW)
    expect(result.status).toBe('valid')
    if (result.status === 'valid') expect(result.claims.submissionId).toBe(7)
  })

  it('reports an authentic-but-aged token as expired', () => {
    const token = signToken({ id: 1 }, OPTIONS, SECRET, NOW)
    const later = new Date(NOW.getTime() + OPTIONS.ttlMs + 1)
    expect(verifyToken(token, 'unit-test', SECRET, later).status).toBe('expired')
  })

  it('rejects a kind mismatch — one link type can never replay as another', () => {
    const token = signToken({ id: 1 }, OPTIONS, SECRET, NOW)
    expect(verifyToken(token, 'other-kind', SECRET, NOW).status).toBe('invalid')
  })

  it('rejects tampered and malformed tokens', () => {
    const token = signToken({ id: 1 }, OPTIONS, SECRET, NOW)
    expect(verifyToken(`${token}x`, 'unit-test', SECRET, NOW).status).toBe('invalid')
    expect(verifyToken('garbage', 'unit-test', SECRET, NOW).status).toBe('invalid')
    expect(verifyToken(null, 'unit-test', SECRET, NOW).status).toBe('invalid')
  })
})
