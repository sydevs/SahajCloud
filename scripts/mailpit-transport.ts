/**
 * Shared capture transport for the `preview-*-emails` scripts.
 *
 * Every preview script drives the real send path and needs somewhere for the
 * mail to land. They each used to call `nodemailer.createTestAccount()`, which
 * provisions a throwaway Ethereal inbox — convenient, but Ethereal deletes
 * messages after a few hours, so the links these scripts print (and that we now
 * put in PR descriptions) were dead well before anyone reviewed them.
 *
 * They send to Mailpit instead: 7-day retention and a stable `/view/<id>` link.
 */

import nodemailer from 'nodemailer'

import { buildSmtpTransportOptions } from '@/plugins/email'

/**
 * Build the capture transport, plus a way to turn a send result into a link.
 *
 * @throws If `SMTP_URL` is unset. These scripts exist to produce reviewable
 *   links, so a run that silently sent nowhere would be worse than no run —
 *   it would print an empty report that looks like success.
 */
export function createCaptureTransport() {
  const url = process.env.SMTP_URL
  if (!url) {
    throw new Error(
      'SMTP_URL is not set, so there is nowhere to capture preview mail.\n' +
        'Load the shared credentials first:  set -a; . ./.env.claude.local; set +a\n' +
        'See docs/rules/email.md for what SMTP_URL points at and why.',
    )
  }

  const transport = nodemailer.createTransport(buildSmtpTransportOptions(url))
  const viewerBase = (process.env.MAILPIT_URL ?? '').replace(/\/$/, '')

  /**
   * A viewable link for one captured message.
   *
   * Mailpit returns its own message id in the SMTP acceptance line
   * (`250 2.0.0 Ok: queued as <id>`), which is the id its web UI addresses.
   * Returns `false` — matching nodemailer's `getTestMessageUrl` contract, which
   * the callers already handle — when the id or viewer base is unavailable.
   */
  const messageUrl = (info: { response?: string }): string | false => {
    const id = info.response?.match(/queued as (\S+)/)?.[1]
    return id && viewerBase ? `${viewerBase}/view/${id}` : false
  }

  return { transport, messageUrl }
}
