/**
 * Integration tests for `POST /api/contact-admin` (#602).
 *
 * Exercises the handler against a real Payload instance, so the auth gate and
 * the per-client `allowedDomains` origin gate run against real `clients`
 * documents rather than fakes. The two external dependencies are stubbed: the
 * Turnstile siteverify call (mocked module) and the mailer (`payload.sendEmail`
 * spy) — the message envelope itself is covered by
 * `tests/unit/send-contact-admin.spec.ts`.
 *
 * The status matrix is the contract, since the caller is a browser widget that
 * has to tell "retry the captcha" from "your message is gone":
 * 200 · 400 · 403 (auth) · 403 (origin) · 403 (captcha) · 500 · 502.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TurnstileVerification } from '@/lib/turnstile/verifyTurnstile'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Hoisted so the module mock below can reference it; each test sets the verdict
// it wants. Verification is a network call in production — the endpoint's job is
// to react to each verdict correctly, which is what these pin.
const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

// Imported after the mock so the handler picks up the stubbed verifier.
const { contactAdmin } = await import('@/endpoints/contactAdmin')

type TestUser = {
  id: number | string
  collection: string
  _status?: 'published' | 'draft'
  name?: string
  allowedDomains?: string | null
} | null

type ContactBody = {
  ok?: boolean
  errors?: { message: string; code?: string }[]
}

const VALID_BODY = {
  message: 'The venue for this class closed last month.',
  turnstileToken: 'tok-valid',
}

const pass: TurnstileVerification = { success: true }

describe('contactAdmin endpoint (POST /api/contact-admin)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let client: TestUser
  let managerId: number
  let sendEmail: ReturnType<typeof vi.spyOn>

  async function callContact(
    body: unknown,
    options: { user?: TestUser; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: ContactBody }> {
    const req = {
      payload,
      headers: new Headers(options.headers ?? {}),
      user: options.user === undefined ? client : options.user,
      context: {},
      json: async () => body,
    } as unknown as PayloadRequest

    const response = (await contactAdmin.handler(req)) as Response
    return { status: response.status, body: await response.json() }
  }

  /** The message `payload.sendEmail` was handed by the last successful call. */
  function lastMessage(): { to: string; subject: string; html: string; replyTo?: string } {
    return sendEmail.mock.calls[0]?.[0] as never
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Contact Manager',
      email: 'contact-manager@example.com',
    })
    managerId = manager.id

    const clientDoc = await testData.createClient(payload, managerId, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    client = {
      id: clientDoc.id,
      collection: 'clients',
      _status: 'published',
      name: 'Atlas Widget',
    }
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    verifyMock.mockReset()
    verifyMock.mockResolvedValue(pass)
    // Stub the mailer rather than the adapter: the shared EmailTestAdapter sends
    // over real SMTP and drops `replyTo`, neither of which belongs in this lane.
    sendEmail = vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    sendEmail.mockRestore()
  })

  describe('success', () => {
    it('returns { ok: true } and sends exactly one email to the contact address', async () => {
      const { status, body } = await callContact({ ...VALID_BODY, subject: 'Issue report' })

      expect(status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect(lastMessage().to).toBe('contact@sydevelopers.com')
      expect(lastMessage().subject).toBe('[Atlas Widget] Issue report')
      expect(lastMessage().html).toContain('The venue for this class closed last month.')
    })

    it('accepts the minimal body and labels it "Message" by default', async () => {
      const { status } = await callContact(VALID_BODY)

      expect(status).toBe(200)
      expect(lastMessage().subject).toBe('[Atlas Widget] Message')
      // Nothing the caller didn't send is invented into the details block.
      expect(lastMessage().html).not.toContain('Host page')
      expect(lastMessage().html).not.toContain('User agent')
    })

    it('sets Reply-To to the sender and forwards every context key', async () => {
      const { status } = await callContact({
        ...VALID_BODY,
        email: 'seeker@example.com',
        subject: 'Issue report',
        context: {
          path: '/events/berlin',
          hostUrl: 'https://atlas.example.org/embed',
          locale: 'de',
          error: 'TypeError: x is not a function',
          userAgent: 'Mozilla/5.0 (X11)',
        },
      })

      expect(status).toBe(200)
      expect(lastMessage().replyTo).toBe('seeker@example.com')
      for (const value of [
        '/events/berlin',
        'https://atlas.example.org/embed',
        'de',
        'TypeError: x is not a function',
        'Mozilla/5.0 (X11)',
      ]) {
        expect(lastMessage().html).toContain(value)
      }
    })

    it('leaves Reply-To absent when the sender left no address', async () => {
      await callContact(VALID_BODY)

      expect('replyTo' in lastMessage()).toBe(false)
    })

    it('verifies the captcha before any email work, forwarding CF-Connecting-IP', async () => {
      await callContact(VALID_BODY, { headers: { 'cf-connecting-ip': '203.0.113.7' } })

      expect(verifyMock).toHaveBeenCalledWith('tok-valid', '203.0.113.7')
    })
  })

  describe('auth gate', () => {
    // 403, not 401: `requireActiveClient` is the shared guard for every public
    // endpoint here and answers 403 for "not a published client" — hand-rolling
    // a different status for this one endpoint would split that contract.
    it('rejects unauthenticated callers with 403', async () => {
      const { status } = await callContact(VALID_BODY, { user: null })

      expect(status).toBe(403)
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('rejects managers with 403', async () => {
      const { status } = await callContact(VALID_BODY, {
        user: { id: managerId, collection: 'managers' },
      })

      expect(status).toBe(403)
    })

    it('rejects unpublished (draft) clients with 403', async () => {
      const { status } = await callContact(VALID_BODY, {
        user: { ...client!, _status: 'draft' },
      })

      expect(status).toBe(403)
    })

    it('rejects before verifying the captcha', async () => {
      await callContact(VALID_BODY, { user: null })

      expect(verifyMock).not.toHaveBeenCalled()
    })
  })

  describe('origin gate', () => {
    // This handler touches no collection, so the usage plugin's
    // beforeOperation hooks never fire — the endpoint calls
    // `assertClientOriginAllowed` itself. These prove that call is wired.
    it('rejects an Origin outside the client’s allowedDomains with 403', async () => {
      const { status, body } = await callContact(VALID_BODY, {
        user: { ...client!, allowedDomains: 'atlas.example.org' },
        headers: { origin: 'https://evil.example.com' },
      })

      expect(status).toBe(403)
      expect(body.errors?.[0]?.message).toContain('origin is not allowed')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('allows an Origin on the allowlist', async () => {
      const { status } = await callContact(VALID_BODY, {
        user: { ...client!, allowedDomains: 'atlas.example.org' },
        headers: { origin: 'https://atlas.example.org' },
      })

      expect(status).toBe(200)
    })

    it('allows any Origin when the client configured no allowlist', async () => {
      const { status } = await callContact(VALID_BODY, {
        headers: { origin: 'https://anywhere.example.com' },
      })

      expect(status).toBe(200)
    })
  })

  describe('body validation', () => {
    it.each([
      ['a missing message', { turnstileToken: 'tok-valid' }],
      ['a message under the 10-char floor', { message: 'too short', turnstileToken: 'tok-valid' }],
      ['a message over the 5000-char ceiling', { message: 'x'.repeat(5001), turnstileToken: 't' }],
      ['a missing turnstile token', { message: VALID_BODY.message }],
      ['an oversized turnstile token', { ...VALID_BODY, turnstileToken: 'x'.repeat(2049) }],
      ['a malformed email', { ...VALID_BODY, email: 'not-an-email' }],
      ['an oversized subject', { ...VALID_BODY, subject: 'x'.repeat(201) }],
      ['an oversized context value', { ...VALID_BODY, context: { error: 'x'.repeat(2001) } }],
    ])('returns 400 for %s', async (_label, body) => {
      const { status, body: responseBody } = await callContact(body)

      expect(status).toBe(400)
      expect(responseBody).toHaveProperty('errors')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('returns 400 for an unparseable body', async () => {
      const req = {
        payload,
        headers: new Headers(),
        user: client,
        context: {},
        json: async () => {
          throw new Error('Unexpected token')
        },
      } as unknown as PayloadRequest

      const response = (await contactAdmin.handler(req)) as Response
      expect(response.status).toBe(400)
    })
  })

  describe('captcha', () => {
    it('returns 403 with a distinguishable code when Cloudflare rejects the token', async () => {
      verifyMock.mockResolvedValue({
        success: false,
        reason: 'rejected',
        errorCodes: ['invalid-input-response'],
      } satisfies TurnstileVerification)

      const { status, body } = await callContact(VALID_BODY)

      expect(status).toBe(403)
      // The widget resets its captcha on this code instead of giving up.
      expect(body.errors?.[0]?.code).toBe('captcha_failed')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('returns 403 for a replayed (already redeemed) token', async () => {
      verifyMock.mockResolvedValue({
        success: false,
        reason: 'rejected',
        errorCodes: ['timeout-or-duplicate'],
      } satisfies TurnstileVerification)

      const { status, body } = await callContact(VALID_BODY)

      expect(status).toBe(403)
      expect(body.errors?.[0]?.code).toBe('captcha_failed')
    })

    it.each(['not-configured', 'request-failed'] as const)(
      'returns 500 without a captcha code when verification fails for reason %s',
      async (reason) => {
        verifyMock.mockResolvedValue({ success: false, reason } satisfies TurnstileVerification)

        const { status, body } = await callContact(VALID_BODY)

        // Our failure, not the sender's — and never a pass. The absent `code`
        // keeps server misconfiguration out of the public error contract.
        expect(status).toBe(500)
        expect(body.errors?.[0]?.code).toBeUndefined()
        expect(sendEmail).not.toHaveBeenCalled()
      },
    )
  })

  it('returns 502 when the email cannot be delivered — never a false 200', async () => {
    // The email is the entire deliverable: nothing is persisted, so a swallowed
    // failure is a message the sender believes was received and never was.
    sendEmail.mockRejectedValue(new Error('Resend 422'))

    const { status, body } = await callContact(VALID_BODY)

    expect(status).toBe(502)
    expect(body.ok).toBeUndefined()
    expect(body.errors?.[0]?.message).toContain('Could not deliver')
  })
})
