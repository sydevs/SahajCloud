/**
 * Shared capture transport for the `preview-*-emails` scripts.
 *
 * Every preview script drives the real send path, and needs somewhere
 * for the mail to land. Each script used to call
 * `nodemailer.createTestAccount()`, which creates a throwaway Ethereal
 * inbox. That was convenient, but Ethereal deletes messages after a few
 * hours. So the links these scripts print, now also used in PR
 * descriptions, went dead before anyone reviewed them.
 *
 * These scripts send to Mailpit instead. Mailpit keeps messages for 7
 * days, at a stable `/view/<id>` link.
 *
 * ⚠ **They send over Mailpit's HTTP API, not SMTP.** A Claude routine
 * reaches the network only through an HTTPS proxy, so SMTP to Mailpit's
 * TCP proxy times out there (#807) and no routine could post a preview
 * link. `SMTP_URL` stays what the *app* sends through, on a Railway
 * preview and under `pnpm dev`.
 */

import type { Transport, Transporter } from 'nodemailer'

import nodemailer from 'nodemailer'

/** What `send` resolves to, in place of an SMTP acceptance line. */
export interface CaptureInfo {
  /** Mailpit's id for the stored message, the one its `/view/<id>` URL takes. */
  id: string
  envelope: { from: string | false; to: string[] }
  messageId: string
}

interface NormalizedAddress {
  address: string
  name?: string
}

interface NormalizedAttachment {
  content?: string
  encoding?: string
  filename?: string | false
  contentType?: string
  cid?: string
}

/**
 * The slice of `MailMessage.normalize()` output this transport maps. Its
 * typings claim the raw `Mail.Options` input shape, but by this point
 * every address is parsed to `{ address, name }` and every attachment's
 * content is a string.
 */
export interface NormalizedMail {
  from?: NormalizedAddress | NormalizedAddress[]
  to?: NormalizedAddress[]
  cc?: NormalizedAddress[]
  bcc?: NormalizedAddress[]
  replyTo?: NormalizedAddress[]
  subject?: string
  html?: string
  text?: string
  attachments?: NormalizedAttachment[]
  normalizedHeaders?: Record<string, string>
}

const toMailpitAddress = ({ address, name }: NormalizedAddress) => ({
  Email: address,
  ...(name && { Name: name }),
})

/**
 * Map a normalized nodemailer message onto Mailpit's `POST /api/v1/send`
 * body.
 *
 * @throws For an attachment with no content, since a preview that
 *   silently drops the `.ics` reads as a template that never attached it.
 */
export function toMailpitMessage(mail: NormalizedMail) {
  const from = [mail.from ?? []].flat()[0]

  return {
    ...(from && { From: toMailpitAddress(from) }),
    ...(mail.to?.length && { To: mail.to.map(toMailpitAddress) }),
    ...(mail.cc?.length && { Cc: mail.cc.map(toMailpitAddress) }),
    ...(mail.bcc?.length && { Bcc: mail.bcc.map(({ address }) => address) }),
    ...(mail.replyTo?.length && { ReplyTo: mail.replyTo.map(toMailpitAddress) }),
    ...(mail.subject && { Subject: mail.subject }),
    ...(mail.html && { HTML: mail.html }),
    ...(mail.text && { Text: mail.text }),
    ...(mail.normalizedHeaders &&
      Object.keys(mail.normalizedHeaders).length > 0 && { Headers: mail.normalizedHeaders }),
    ...(mail.attachments?.length && {
      Attachments: mail.attachments.map((attachment) => {
        const filename = attachment.filename || 'attachment'
        if (attachment.content === undefined) {
          throw new Error(`Attachment "${filename}" has no content to send to Mailpit.`)
        }
        // `normalize()` base64-encodes Buffer content but leaves a string in
        // its own encoding, and Mailpit takes base64 only.
        const encoding = (attachment.encoding ?? 'utf8') as BufferEncoding

        return {
          Content: Buffer.from(attachment.content, encoding).toString('base64'),
          Filename: filename,
          ...(attachment.contentType && { ContentType: attachment.contentType }),
          ...(attachment.cid && { ContentID: attachment.cid }),
        }
      }),
    }),
  }
}

/**
 * Build the capture transport, and a way to turn a send result into a
 * link.
 *
 * @throws If `MAILPIT_URL` or `MAILPIT_UI_AUTH` is unset. These scripts
 *   exist to produce reviewable links. A run that silently sends nowhere
 *   is worse than no run at all: it prints an empty report that looks
 *   like success.
 */
export function createCaptureTransport() {
  const viewerBase = (process.env.MAILPIT_URL ?? '').replace(/\/$/, '')
  const credentials = process.env.MAILPIT_UI_AUTH

  if (!viewerBase || !credentials) {
    throw new Error(
      'MAILPIT_URL and MAILPIT_UI_AUTH must be set, so there is somewhere to capture preview mail.\n' +
        'In a Claude routine they come from the cloud environment. Locally, load them first:  set -a; . ./.env.claude.local; set +a\n' +
        'See docs/rules/email.md for what they point at and why.',
    )
  }

  const authorization = `Basic ${Buffer.from(credentials).toString('base64')}`

  const mailpitHttp: Transport<CaptureInfo> = {
    name: 'mailpit-http',
    version: '1',
    send(mail, callback) {
      mail.normalize((normalizeError, data) => {
        if (normalizeError || !data) {
          callback(normalizeError ?? new Error('nodemailer produced no message'), undefined as never)
          return
        }

        const post = async (): Promise<CaptureInfo> => {
          const response = await fetch(`${viewerBase}/api/v1/send`, {
            method: 'POST',
            headers: { Authorization: authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify(toMailpitMessage(data as NormalizedMail)),
            signal: AbortSignal.timeout(30_000),
          })
          const body = await response.text()
          if (!response.ok) {
            throw new Error(`Mailpit refused the message: ${response.status} ${body.trim()}`)
          }

          const { ID } = JSON.parse(body) as { ID?: string }
          if (!ID) throw new Error(`Mailpit accepted the message but returned no ID: ${body}`)

          return {
            id: ID,
            envelope: mail.message.getEnvelope(),
            messageId: mail.message.messageId(),
          }
        }

        post().then(
          (info) => callback(null, info),
          (error: Error) => callback(error, undefined as never),
        )
      })
    },
  }

  // @types/nodemailer's custom-transport overload returns the SMTP info type
  // whatever `T` the transport resolves with.
  const transport = nodemailer.createTransport(mailpitHttp) as unknown as Transporter<CaptureInfo>

  /** A viewable link for one captured message. */
  const messageUrl = (info: CaptureInfo): string => `${viewerBase}/view/${info.id}`

  return { transport, messageUrl }
}
