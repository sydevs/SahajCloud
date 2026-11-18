/**
 * Sanitizers for placing free text into a single-line header or serialized
 * property, where an embedded line break would let the remainder be
 * reinterpreted as structure.
 *
 * Two live sinks in the registrant-email path, both fed by manager-authored
 * fields (event title, client name):
 *
 * - an email header — a CR/LF ends the header and injects the next line as
 *   another one (`Bcc:` the obvious abuse);
 * - an ICS calendar property — ical-generator escapes the VEVENT TEXT fields
 *   but not the calendar-level `name`, so a CR/LF there injects real calendar
 *   lines (a `BEGIN:VALARM` component, another VEVENT, …).
 *
 * Both need line breaks gone. Sanitizing at the point a value becomes a line is
 * cheap, covers rows that already exist, and doesn't depend on every upstream
 * field enforcing its own validation.
 */

/**
 * Collapse a value to a single line: line breaks (and any run of whitespace)
 * become one space. Safe for an email `Subject` or an ICS property value, both
 * of which may legitimately contain quotes and punctuation.
 */
export function stripNewlines(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `stripNewlines` plus the quoting a display name needs inside
 * `Display Name <address>`.
 *
 * A comma ends an address and makes the rest of the name a second one, so a
 * manager-authored name reaching the header unquoted can turn one `Reply-To`
 * or `From` into two — the second of them unroutable, which Resend refuses
 * outright. Every RFC 5322 `specials` character therefore forces the
 * quoted-string form. `"`, `<` and `>` are dropped rather than escaped, so
 * nothing inside the quotes can close them.
 */
export function headerDisplayName(value: string): string {
  const text = stripNewlines(value).replace(/["<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return /[(),.:;@[\\\]]/.test(text) ? `"${text}"` : text
}
