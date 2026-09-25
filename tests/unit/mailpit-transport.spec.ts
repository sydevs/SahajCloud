import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCaptureTransport, toMailpitMessage } from '../../scripts/mailpit-transport'

/**
 * The preview scripts' capture transport posts to Mailpit's HTTP send API,
 * because a Claude routine cannot reach Mailpit over SMTP (#807). These
 * specs pin the mapping from nodemailer's normalized message, and the one
 * request the transport makes.
 */

describe('toMailpitMessage', () => {
  it('maps addresses, content and headers onto the send body', () => {
    expect(
      toMailpitMessage({
        from: { address: 'dev@wemeditate.com', name: 'SahajCloud preview' },
        to: [{ address: 'a@example.com', name: '' }],
        cc: [{ address: 'c@example.com', name: 'Cee' }],
        bcc: [{ address: 'b@example.com', name: 'Bee' }],
        replyTo: [{ address: 'support@example.com', name: 'Support' }],
        subject: 'Subject',
        html: '<p>html</p>',
        text: 'text',
        normalizedHeaders: { 'List-Unsubscribe': '<https://example.com/u>' },
      }),
    ).toEqual({
      From: { Email: 'dev@wemeditate.com', Name: 'SahajCloud preview' },
      To: [{ Email: 'a@example.com' }],
      Cc: [{ Email: 'c@example.com', Name: 'Cee' }],
      Bcc: ['b@example.com'],
      ReplyTo: [{ Email: 'support@example.com', Name: 'Support' }],
      Subject: 'Subject',
      HTML: '<p>html</p>',
      Text: 'text',
      Headers: { 'List-Unsubscribe': '<https://example.com/u>' },
    })
  })

  it('base64-encodes a string attachment, and passes base64 content through', () => {
    const { Attachments } = toMailpitMessage({
      attachments: [
        { filename: 'invite.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar' },
        { filename: 'logo.png', content: 'AQI=', encoding: 'base64', cid: 'logo' },
      ],
    })

    expect(Attachments).toEqual([
      {
        Filename: 'invite.ics',
        Content: Buffer.from('BEGIN:VCALENDAR').toString('base64'),
        ContentType: 'text/calendar',
      },
      { Filename: 'logo.png', Content: 'AQI=', ContentID: 'logo' },
    ])
  })

  it('refuses an attachment with no content rather than dropping it', () => {
    expect(() => toMailpitMessage({ attachments: [{ filename: 'invite.ics' }] })).toThrow(
      /invite\.ics/,
    )
  })
})

describe('createCaptureTransport', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('MAILPIT_URL', 'https://mailpit.example.com/')
    vi.stubEnv('MAILPIT_SEND_AUTH', 'sender:send-pass')
    vi.stubEnv('MAILPIT_UI_AUTH', 'viewer:ui-pass')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ID: 'abc123' }), { status: 200 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
  })

  const MESSAGE = {
    from: 'SahajCloud preview <dev@wemeditate.com>',
    to: 'manager-preview@example.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
  }

  const send = () => createCaptureTransport().transport.sendMail(MESSAGE)

  const authHeader = () =>
    (fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }).headers
      .Authorization

  it('posts to the send endpoint and links the stored message', async () => {
    const { transport, messageUrl } = createCaptureTransport()
    const info = await transport.sendMail(MESSAGE)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mailpit.example.com/api/v1/send')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      From: { Email: 'dev@wemeditate.com', Name: 'SahajCloud preview' },
      To: [{ Email: 'manager-preview@example.com' }],
      Subject: 'Hello',
      HTML: '<p>Hi</p>',
    })
    expect(messageUrl(info)).toBe('https://mailpit.example.com/view/abc123')
  })

  it('prefers the send-only credential over the UI one', async () => {
    await send()
    expect(authHeader()).toBe(`Basic ${Buffer.from('sender:send-pass').toString('base64')}`)
  })

  it('falls back to the UI credential when no send credential is set', async () => {
    vi.stubEnv('MAILPIT_SEND_AUTH', '')
    await send()
    expect(authHeader()).toBe(`Basic ${Buffer.from('viewer:ui-pass').toString('base64')}`)
  })

  it('rejects with Mailpit’s reason when the send is refused', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized.\n', { status: 401 }))
    await expect(send()).rejects.toThrow('Mailpit refused the message: 401 Unauthorized.')
  })

  it('refuses to build without a Mailpit URL or credential', () => {
    vi.stubEnv('MAILPIT_SEND_AUTH', '')
    vi.stubEnv('MAILPIT_UI_AUTH', '')
    expect(() => createCaptureTransport()).toThrow(/MAILPIT_SEND_AUTH/)

    vi.stubEnv('MAILPIT_UI_AUTH', 'viewer:ui-pass')
    vi.stubEnv('MAILPIT_URL', '')
    expect(() => createCaptureTransport()).toThrow(/MAILPIT_URL/)
  })
})
