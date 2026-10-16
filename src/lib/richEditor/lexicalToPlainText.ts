import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

/**
 * A Lexical rich-text value as plain text — the inverse of `plainTextToLexical`
 * next door.
 *
 * This is Payload's own `convertLexicalToPlaintext`, not a second flattener
 * (#961 deleted the hand-rolled one). It separates blocks with a blank line and
 * keeps a soft break as one newline, so splitting on the blank line recovers
 * the block structure the editor stored.
 *
 * The one behaviour it adds is totality. Payload's converter throws a
 * `TypeError` on a malformed tree — `children` that is not an array, or a null
 * child — and every caller here reads a value some other party stored: an
 * events `description`, or a `proposed` patch whose values `validateProposal`
 * deliberately does not check. Each of them wants a projection, not an
 * exception, and each derives its own empty answer from this one:
 * `|| null` for a field that renders as blank, `.split(/\n{2,}/)` for `[]`.
 */
export function lexicalToPlainText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  try {
    return convertLexicalToPlaintext({ data: value as never }).trim()
  } catch {
    return ''
  }
}
