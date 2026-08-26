/**
 * Caller-supplied context attached to a user message.
 *
 * Lives with the collection that stores it rather than in
 * `src/endpoints/responseTypes.ts`, where it sat while `POST /api/contact-admin`
 * was a root endpoint owned by nothing (#602). The intake is now the built-in
 * create on `user-messages`, so the collection owns the shape.
 *
 * Every key is optional and every one is **foreign text** — it arrives from a
 * client app's own instrumentation. The bounds live on the `context` field's
 * validator; the meaning lives here.
 */
export type UserMessageContext = {
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
