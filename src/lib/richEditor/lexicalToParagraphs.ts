/**
 * Read a Lexical rich-text value back out as plain-text paragraphs.
 *
 * The inverse of `./plainTextToLexical`, and the shape a consumer that must not
 * receive HTML needs: one string per block, ready to wrap in whatever markup the
 * reader uses. `convertLexicalToPlaintext` already renders a paragraph, heading
 * or list item as text and separates blocks with a blank line (`\n\n`) while
 * keeping a soft line break as a single `\n` — so splitting on the blank line
 * recovers exactly the block structure the editor stored, and a soft break stays
 * inside its paragraph.
 */

import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

/**
 * Paragraphs of a rich-text value; `[]` when it is empty, absent, or malformed.
 *
 * Malformed editor state resolves to `[]` rather than throwing: this feeds a
 * public read on somebody else's page render, where one bad document must not
 * take the response down.
 */
export function lexicalToParagraphs(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  try {
    return convertLexicalToPlaintext({ data: value as never })
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}
