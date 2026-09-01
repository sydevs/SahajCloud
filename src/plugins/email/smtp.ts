/**
 * SMTP transport for captured (non-delivered) mail.
 *
 * Local development and Railway PR previews both send through Mailpit rather
 * than a real provider. Mailpit keeps each message for 7 days and exposes a
 * stable `/view/<id>` link, which is what makes an email reviewable from a PR
 * description days after the run that produced it.
 *
 * This replaced Ethereal, which was never configured explicitly — it was what
 * `nodemailerAdapter` fell back to when given no `transportOptions`. Two
 * problems with that: Ethereal deletes messages after a few hours, so a link in
 * a PR was dead before anyone clicked it; and the fallback was invisible, so it
 * was easy to miss that Railway previews (which run with NODE_ENV=production)
 * skipped it entirely and sent real mail via Resend.
 */

/** Nodemailer SMTP transport options, parsed from a `smtp://user:pass@host:port` URL. */
export interface SmtpTransportOptions {
  host: string
  port: number
  secure: boolean
  auth?: { user: string; pass: string }
}

/**
 * Parse `SMTP_URL` into nodemailer transport options.
 *
 * `secure` is false because Railway's TCP proxy does not terminate TLS in front
 * of Mailpit. That is acceptable precisely because nothing sensitive travels
 * this path: it carries test mail to a capture inbox, never real delivery.
 *
 * @param url - `smtp://user:pass@host:port`
 * @throws If the URL is malformed — a misconfigured capture inbox must fail
 *   loudly rather than quietly degrade to dropping mail.
 */
export function buildSmtpTransportOptions(url: string): SmtpTransportOptions {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`SMTP_URL is not a valid URL: ${url.replace(/:[^:@/]*@/, ':***@')}`)
  }

  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
    throw new Error(`SMTP_URL must use smtp:// or smtps:// (got ${parsed.protocol})`)
  }
  if (!parsed.hostname) {
    throw new Error('SMTP_URL has no host')
  }

  const secure = parsed.protocol === 'smtps:'
  const port = parsed.port ? Number(parsed.port) : secure ? 465 : 25

  return {
    host: parsed.hostname,
    port,
    secure,
    ...(parsed.username
      ? { auth: { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) } }
      : {}),
  }
}

/**
 * Say clearly that email is off, and return no adapter.
 *
 * Payload treats a missing `email` key as "no transport configured" and logs
 * attempted sends instead of delivering them. The warning exists so that a
 * developer wondering where their verification email went finds the answer in
 * the boot log rather than in this file.
 */
export function warnEmailDisabled(): undefined {
  // eslint-disable-next-line no-console -- boot-time diagnostic, before any logger exists
  console.warn(
    '[email] No SMTP_URL set and not in production — email is DISABLED. ' +
      'Sends will be logged, not delivered. Set SMTP_URL to the Mailpit endpoint ' +
      '(see src/plugins/email/AGENTS.md) to capture mail and get shareable preview links.',
  )
  return undefined
}
