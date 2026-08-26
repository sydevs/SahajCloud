import { createHash } from 'node:crypto'

/**
 * Fingerprint of a message body, for the screening job's duplicate-body check.
 *
 * The normalization is the whole design. Spam is the same payload sent many
 * times, and the cheap variations a sender makes between sends are casing and
 * whitespace — a trailing newline, a doubled space, a capitalized first word.
 * Folding those away means one hash covers the family; folding away anything
 * *more* would start matching genuinely different messages, which is the
 * failure that actually costs us (a lost bug report).
 *
 * Deliberately exact rather than fuzzy. A near-duplicate detector needs a
 * threshold, and a threshold needs real spam data to tune against — which we
 * won't have until this has run for a while. Exact equality has no knob and no
 * false positives worth the name: two people do not independently type the same
 * ten-plus characters of free text.
 *
 * SHA-256 because it is what `node:crypto` gives for free and the column is
 * indexed; there is nothing secret here, so the choice is about collision
 * resistance and nothing else.
 */
export function normalizedBodyHash(message: string): string {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}
