/**
 * A `mailto:` URL with a pre-filled subject and body.
 *
 * Both values are percent-encoded here: a newline in the body and an `&` in
 * either would otherwise end the parameter, and every caller composes its two
 * strings from free text an event title or a person's name reaches.
 */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
