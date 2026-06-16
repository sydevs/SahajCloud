/**
 * Convert an Atlas plain-text description into a Lexical rich-text value.
 *
 * Atlas stores event descriptions as plain strings (paragraphs split by
 * newlines), but the Events `description` is a Lexical `richText` field — it
 * rejects a raw string ("The value passed to the Lexical editor is not an
 * object"). This builds the minimal Lexical document the editor expects: one
 * paragraph per newline-separated block, each a single text node (no HTML
 * interpretation, so accented/non-ASCII characters pass through verbatim).
 */

interface LexicalTextNode {
  type: 'text'
  version: number
  text: string
  format: number
  style: string
  mode: 'normal'
  detail: number
}

interface LexicalParagraphNode {
  type: 'paragraph'
  version: number
  children: LexicalTextNode[]
  direction: 'ltr'
  format: string
  indent: number
  textFormat: number
}

export interface LexicalValue {
  root: {
    type: 'root'
    version: number
    children: LexicalParagraphNode[]
    direction: 'ltr'
    format: string
    indent: number
  }
}

function textNode(text: string): LexicalTextNode {
  return { type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 }
}

function paragraphNode(text: string): LexicalParagraphNode {
  return {
    type: 'paragraph',
    version: 1,
    children: [textNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
  }
}

/** Plain text → a Lexical value, or undefined when blank. */
export function plainTextToLexical(text: string | null | undefined): LexicalValue | undefined {
  const trimmed = text?.trim()
  if (!trimmed) return undefined
  const paragraphs = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    root: {
      type: 'root',
      version: 1,
      children: paragraphs.map(paragraphNode),
      direction: 'ltr',
      format: '',
      indent: 0,
    },
  }
}
