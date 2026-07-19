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
 * `stripNewlines` plus removal of the quote/angle-bracket characters that would
 * break out of an email display name — which is emitted unquoted inside
 * `Display Name <address>`.
 */
export function headerDisplayName(value: string): string {
  return stripNewlines(value).replace(/["<>]/g, ' ').replace(/\s+/g, ' ').trim()
}
