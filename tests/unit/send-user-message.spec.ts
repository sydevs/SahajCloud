/**
 * Unit tests for the user-message send helper — the message envelope, not the
 * screening job that calls it. Pure: `payload.sendEmail` is a spy, so there's no
 * Payload bootstrap, no DB, and no SMTP.
 *
 * These cover the parts an integration test cannot see, because the shared
 * `EmailTestAdapter` captures only `to`/`from`/`subject`/`html` and drops
 * `replyTo` entirely — and `replyTo` is precisely what makes this channel useful
 * (a reply must reach the sender, and must be *absent* rather than empty when
 * there is nobody to reply to).
 */
import { describe, expect, it, vi } from 'vitest'

import { CONTACT_EMAIL } from '@/lib/contact'
import type { SendUserMessageArgs } from '@/lib/notifications/sendUserMessage'
import { sendUserMessage } from '@/lib/notifications/sendUserMessage'

type SentMessage = {
  to: string
  from: string
  subject: string
  html: string
  replyTo?: string
}

/** A fake `payload` whose only job is to record the message it was handed. */
function fakePayload() {
  const sendEmail = vi.fn(async (_message: SentMessage) => undefined)
  return { payload: { sendEmail } as never, sendEmail }
}

const baseArgs = {
  clientName: 'Atlas Widget',
  message: 'The venue for this class closed last month.',
  subject: 'Issue report',
  receivedAt: '2026-08-03T09:30:00.000Z',
}

async function send(overrides: Partial<SendUserMessageArgs> = {}) {
  const { payload, sendEmail } = fakePayload()
  await sendUserMessage({ payload, ...baseArgs, ...overrides })
  return sendEmail.mock.calls[0][0]
}

describe('sendUserMessage', () => {
  it('sends to the contact address with the client-prefixed subject', async () => {
    const message = await send()

    expect(message.to).toBe(CONTACT_EMAIL)
    expect(message.subject).toBe('[Atlas Widget] Issue report')
    // Resend verifies senders per domain, so From cannot be the viewer.
    expect(message.from).toContain(CONTACT_EMAIL)
    expect(message.html).toContain('The venue for this class closed last month.')
  })

  it('sets Reply-To to the sender so a reply reaches them directly', async () => {
    const message = await send({ senderEmail: 'seeker@example.com' })

    expect(message.replyTo).toBe('seeker@example.com')
  })

  it('omits Reply-To entirely — not empty — when no address was supplied', async () => {
    const message = await send()

    // An empty `Reply-To` is an invalid header (Resend 422s on one), so the key
    // must be absent rather than falsy.
    expect('replyTo' in message).toBe(false)
  })

  it('strips line breaks from the client name and subject before the header', async () => {
    // Both halves are untrusted single-line text — a CR/LF would end the Subject
    // header and let the rest be reparsed as another one (`Bcc:` being the abuse).
    const message = await send({
      clientName: 'Atlas\r\nBcc: attacker@example.com',
      subject: 'Issue\nreport',
    })

    expect(message.subject).not.toMatch(/[\r\n]/)
    expect(message.subject).toBe('[Atlas Bcc: attacker@example.com] Issue report')
  })

  it('renders every supplied context value into the details block', async () => {
    const message = await send({
      senderEmail: 'seeker@example.com',
      context: {
        locale: 'de',
        path: '/events/berlin',
        hostUrl: 'https://atlas.example.org/embed',
        error: 'TypeError: x is not a function',
        userAgent: 'Mozilla/5.0 (X11)',
      },
    })

    for (const value of [
      'Atlas Widget',
      'de',
      '/events/berlin',
      'https://atlas.example.org/embed',
      'TypeError: x is not a function',
      'Mozilla/5.0 (X11)',
      '2026-08-03T09:30:00.000Z',
    ]) {
      expect(message.html).toContain(value)
    }
  })

  it('renders no context rows for a minimal message', async () => {
    const message = await send()

    // The service and the received-at stamp are ours. Nothing else is invented.
    expect(message.html).toContain('Atlas Widget')
    expect(message.html).toContain('2026-08-03T09:30:00.000Z')
    expect(message.html).not.toContain('Host page')
    expect(message.html).not.toContain('User agent')
  })

  it('propagates a send failure rather than swallowing it', async () => {
    // The screening job's `failed` status depends on this: a failure that never
    // reaches the call site would leave the row marked `delivered` when nothing
    // was delivered, and would earn no retry.
    const sendEmail = vi.fn(async () => {
      throw new Error('Resend 422')
    })

    await expect(sendUserMessage({ payload: { sendEmail } as never, ...baseArgs })).rejects.toThrow(
      'Resend 422',
    )
  })
})
