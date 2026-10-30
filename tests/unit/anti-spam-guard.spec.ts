import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkEmailAllowed, checkNoUrls, verifyTurnstileOrFail } from '@/lib/antiSpam/antiSpamGuard'
import { signToken, verifyToken } from '@/lib/utilities/signedToken'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({ verifyTurnstileToken: verifyMock }))

const NOW = new Date('2026-08-11T12:00:00.000Z')

describe('verifyTurnstileOrFail — which address siteverify is sent (#808)', () => {
  const EDGE = '198.51.100.1'
  const VISITOR = '203.0.113.7'

  const req = (collection: string | undefined, headers: Record<string, string>) =>
    ({
      headers: new Headers(headers),
      user: collection ? { id: 1, collection } : null,
      payload: { logger: { warn: vi.fn(), error: vi.fn() } },
    }) as unknown as PayloadRequest

  beforeEach(() => verifyMock.mockReset().mockResolvedValue({ success: true }))

  it("sends an authenticated client's x-client-ip", async () => {
    await verifyTurnstileOrFail(
      req('clients', { 'cf-connecting-ip': EDGE, 'x-client-ip': VISITOR }),
      'tok',
    )
    expect(verifyMock).toHaveBeenCalledWith('tok', VISITOR)
  })

  it('falls back to cf-connecting-ip when a client sends none, and still passes', async () => {
    const result = await verifyTurnstileOrFail(req('clients', { 'cf-connecting-ip': EDGE }), 'tok')

    expect(verifyMock).toHaveBeenCalledWith('tok', EDGE)
    expect(result.ok).toBe(true)
  })

  it.each([
    ['a manager', 'managers'],
    ['an anonymous caller', undefined],
  ])('ignores x-client-ip from %s', async (_, collection) => {
    await verifyTurnstileOrFail(
      req(collection, { 'cf-connecting-ip': EDGE, 'x-client-ip': VISITOR }),
      'tok',
    )
    expect(verifyMock).toHaveBeenCalledWith('tok', EDGE)
  })
})

describe('checkNoUrls', () => {
  // `.example` is on no listed TLD, so each of the first three dies with its
  // own arm — otherwise removing an arm leaves the suite green.
  it.each([
    'visit https://spam.example now',
    'visit http://spam.example now',
    'go to www.spam-site.example',
    'find us at classes.com today',
    'shady.xyz has details',
    // A left boundary that only looked one character back would exempt this
    // too, since `example.com` sits behind a dot.
    'see buy-now.example.com',
    // An `@` in the value exempts neither arm from the rest of it.
    'https://user@evil.com',
    'a@b.com buy at cheap.shop',
    // `.` is in the arm's own left-boundary class, so a run behind a dot
    // would have no legal match start.
    'join us at .cheap.shop',
    'see ..cheap.shop',
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

  // An address is not a link. Refusing one leaves the sender deleting their
  // own address to get through, whether or not the form marks it required
  // (#921).
  it.each([
    'visitor@gmail.com',
    'visitor@yahoo.com',
    'visitor@hotmail.com',
    'visitor@outlook.com',
    'visitor@icloud.com',
    'visitor@protonmail.com',
    'visitor@gmx.net',
    // A domain is exempt however many labels it carries, and however long.
    'visitor@mail.corp.example.com',
    'visitor@eu-west-1.internal-mail-relay.engineering-platform.corp-shared.example.com',
  ])('passes an address: %s', (text) => {
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
