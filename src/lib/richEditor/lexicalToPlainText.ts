import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

/**
 * A Lexical rich-text value as plain text — the inverse of `plainTextToLexical`
 * next door, and the only flattener in this repo (#961). Blocks separate with a
 * blank line and a soft break stays one newline, so splitting on `/\n{2,}/`
 * recovers the block structure the editor stored.
 *
 * The one behaviour it adds is totality. Payload's converter throws a
 * `TypeError` on a malformed tree — `children` that is not an array, or a null
 * child — and every caller here reads a value some other party stored: an
 * events `description`, or a `proposed` patch whose values `validateProposal`
 * deliberately does not check. Each wants a projection, not an exception, and
 * derives its own empty answer from this one.
 */
export function lexicalToPlainText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  try {
    return convertLexicalToPlaintext({ data: value as never }).trim()
  } catch {
    return ''
  }
}
