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
 */

import nodemailer from 'nodemailer'

import { buildSmtpTransportOptions } from '@/plugins/email'

/**
 * Build the capture transport, and a way to turn a send result into a
 * link.
 *
 * @throws If `SMTP_URL` is unset. These scripts exist to produce
 *   reviewable links. A run that silently sends nowhere is worse than no
 *   run at all: it prints an empty report that looks like success.
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
   * (`250 2.0.0 Ok: queued as <id>`). Its web UI addresses messages by
   * that same id. This returns `false` when the id or viewer base is
   * missing, matching the `getTestMessageUrl` contract from nodemailer
   * that callers already handle.
   */
  const messageUrl = (info: { response?: string }): string | false => {
    const id = info.response?.match(/queued as (\S+)/)?.[1]
    return id && viewerBase ? `${viewerBase}/view/${id}` : false
  }

  return { transport, messageUrl }
}
