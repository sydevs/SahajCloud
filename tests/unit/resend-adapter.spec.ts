/**
 * Unit tests for the Resend email adapter's message mapping.
 *
 * The adapter hand-maps Payload's (nodemailer-shaped) `SendEmailOptions` onto
 * Resend's REST payload, so anything it forgets is silently dropped rather than
 * rejected — which is exactly how `attachments` and `replyTo` went missing
 * before #582. These tests pin the mapping.
 *
 * The dev `nodemailerAdapter` needs no equivalent: it spreads `...message`
 * straight into `transport.sendMail()`, so every field passes through natively.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: { RESEND_API_KEY: undefined } }))

const sendMock = vi.fn()
vi.mock('resend', () => ({
  // A class, not `vi.fn(() => ...)` — the adapter calls `new Resend(key)`.
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { serverEnv } from '@/lib/env'
import { resendAdapter } from '@/plugins/email/resendAdapter'

const env = serverEnv as { RESEND_API_KEY?: string }
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

/** Build the initialized adapter with a stub payload instance. */
function buildAdapter() {
  // The adapter only ever touches `payload.logger`.
  return resendAdapter()({ payload: { logger } } as never)
}

const baseMessage = { subject: 'Hi', to: 'registrant@example.com' }

describe('resendAdapter message mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    env.RESEND_API_KEY = 'test-key-that-is-long-enough'
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
  })

  it('forwards a string attachment (the ICS calendar case)', async () => {
    await buildAdapter().sendEmail({
      ...baseMessage,
      attachments: [
        {
          content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
          contentType: 'text/calendar',
          filename: 'class.ics',
        },
      ],
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].attachments).toEqual([
      {
        content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
        contentType: 'text/calendar',
        filename: 'class.ics',
      },
    ])
  })

  it('forwards a Buffer attachment', async () => {
    const content = Buffer.from('bytes')
    await buildAdapter().sendEmail({
      ...baseMessage,
      attachments: [{ content, filename: 'a.bin' }],
    })

    expect(sendMock.mock.calls[0][0].attachments).toEqual([{ content, filename: 'a.bin' }])
  })

  it('drops a stream attachment with a warning rather than sending a bad payload', async () => {
    // Resend's REST API takes no streams. Forwarding one yields an opaque 422.
    const stream = { pipe: () => undefined, readable: true }
    await buildAdapter().sendEmail({
      ...baseMessage,
      attachments: [{ content: stream as never, filename: 'stream.txt' }],
    })

    expect(sendMock.mock.calls[0][0].attachments).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ filename: 'stream.txt' }))
  })

  it('keeps a hosted `path` attachment, which needs no inline content', async () => {
    await buildAdapter().sendEmail({
      ...baseMessage,
      attachments: [{ filename: 'remote.pdf', path: 'https://example.com/a.pdf' }],
    })

    expect(sendMock.mock.calls[0][0].attachments).toEqual([
      { filename: 'remote.pdf', path: 'https://example.com/a.pdf' },
    ])
  })

  it('forwards replyTo, flattening nodemailer Address objects', async () => {
    await buildAdapter().sendEmail({
      ...baseMessage,
      replyTo: { address: 'support@client.org', name: 'Client Support' },
    })

    expect(sendMock.mock.calls[0][0].replyTo).toEqual(['Client Support <support@client.org>'])
  })

  it('forwards a plain-string replyTo', async () => {
    await buildAdapter().sendEmail({ ...baseMessage, replyTo: 'support@client.org' })

    expect(sendMock.mock.calls[0][0].replyTo).toEqual(['support@client.org'])
  })

  it('omits replyTo and attachments entirely when unset', async () => {
    await buildAdapter().sendEmail({ ...baseMessage, html: '<p>hi</p>' })

    const payload = sendMock.mock.calls[0][0]
    expect(payload).not.toHaveProperty('replyTo')
    expect(payload).not.toHaveProperty('attachments')
  })

  it('does not send when the API key is unconfigured', async () => {
    env.RESEND_API_KEY = undefined
    await buildAdapter().sendEmail(baseMessage)

    expect(sendMock).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })
})
