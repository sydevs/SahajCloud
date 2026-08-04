/**
 * Response shapes for the root-level (non-collection) public endpoints —
 * currently `POST /api/contact-admin`. Exported and committed so client repos
 * (SahajAtlasWeb, WeMeditateWeb) can sync them by raw GitHub URL, and kept in
 * step with the OpenAPI schemas in `src/plugins/openapi/customEndpoints.ts`.
 * Deliberately self-contained — no `@/` imports — so a cross-repo fetch of this
 * single file resolves cleanly.
 */

/** Caller-supplied context attached to a contact message. Every key is optional. */
export type ContactAdminContext = {
  /** Route the sender was on, e.g. `/events/london-meetup`. */
  path?: string
  /** Absolute URL of the host page embedding the widget. */
  hostUrl?: string
  /** Locale the sender was browsing in. */
  locale?: string
  /** Error text/stack the sender was reporting, when the message is a crash report. */
  error?: string
  /** The sender's user-agent string. */
  userAgent?: string
}

/** `POST /api/contact-admin` request body. */
export type ContactAdminRequest = {
  /** The sender's message. */
  message: string
  /** The sender's address, used as the email's `Reply-To`. Omit for anonymous. */
  email?: string
  /** The caller's label for this channel, e.g. `"Issue report"`. Defaults to `"Message"`. */
  subject?: string
  /** Cloudflare Turnstile token from the caller's captcha widget. */
  turnstileToken: string
  /** Anything the caller wants included in the email's details block. */
  context?: ContactAdminContext
}

/** `POST /api/contact-admin` success body. Nothing is persisted — the email is the deliverable. */
export type ContactAdminResponse = {
  ok: true
}

/**
 * Machine-readable reason a contact message was refused, so a caller can react
 * rather than parse prose. Currently one code:
 *
 * - `captcha_failed` — the Turnstile token was invalid, expired, or already
 *   redeemed (tokens are single-use). The caller should reset its captcha widget
 *   and let the sender retry.
 *
 * Sent on the 403 captcha refusal only; the auth 403 carries no `code`.
 */
export type ContactAdminErrorCode = 'captcha_failed'

/**
 * Error body for a refused contact message — the standard
 * `{ errors: [{ message }] }` shape, extended with an optional stable `code`.
 */
export type ContactAdminError = {
  errors: { message: string; code?: ContactAdminErrorCode }[]
}
