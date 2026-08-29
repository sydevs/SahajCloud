/**
 * Email plugin
 *
 * - `resendAdapter` — Payload `email` adapter, production only.
 * - `buildSmtpTransportOptions` / `warnEmailDisabled` — the non-production paths:
 *   capture to Mailpit when `SMTP_URL` is set, otherwise disable email loudly.
 * - `renderEmail` — render a React Email template to inline HTML.
 * - `getEmailBrand` — resolve per-project branding (`EmailBrand`) for a template.
 * - `getClientEmailBrand` — resolve per-client-service branding for registrant
 *   mail, falling back field-by-field to the `sahaj-atlas` project brand.
 *
 * Templates live in `src/emails/`; all email glue lives here in the plugin.
 *
 * @example
 * ```typescript
 * import { getEmailBrand, renderEmail, resendAdapter } from '@/plugins/email'
 *
 * email: resendAdapter(),
 * generateEmailHTML: ({ token, user }) =>
 *   renderEmail(createElement(VerifyEmail, { name: user.name, verifyUrl })),
 * ```
 */

export { resendAdapter } from './resendAdapter'
export { buildSmtpTransportOptions, warnEmailDisabled } from './smtp'
export type { SmtpTransportOptions } from './smtp'
export { renderEmail } from './render'
export { getClientEmailBrand, getEmailBrand } from './brand'
export type { EmailBrand } from './brand'
