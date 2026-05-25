/**
 * Lexical Converter — wm-app-translations seed
 *
 * Converts the human-readable paragraph/segment shape used in
 * `seeds/wm-app-translations/data.<locale>.json` into the Lexical JSON
 * tree shape that Payload's richText fields persist.
 *
 * The Lexical shape this emits intentionally matches the conventions of
 * `seeds/lib/lexicalConverter.ts` (the EditorJS→Lexical converter that
 * has been tested against the live Payload editor) — same field set on
 * text/paragraph/link/root nodes, `direction: null` everywhere, link
 * nodes use `version: 3` with `fields: { linkType: 'custom', url, newTab: false }`.
 *
 * Kept as a separate file (not inlined into import.ts) so the conversion
 * logic can be unit-tested in `tests/unit/wm-app-translations-lexical.spec.ts`
 * without booting Payload.
 */

// ============================================================================
// Public types (seed-side shape)
// ============================================================================

/**
 * A single inline segment inside a paragraph.
 *
 * - A plain or formatted text run: { text, bold?, italic? }
 * - An inline link: { type: 'link', text, href, bold?, italic? }
 */
export interface SeedTextSegment {
  text: string
  bold?: true
  italic?: true
}

export interface SeedLinkSegment {
  type: 'link'
  text: string
  href: string
  bold?: true
  italic?: true
}

export type SeedSegment = SeedTextSegment | SeedLinkSegment

/**
 * The richText payload as written in `data.<locale>.json`.
 *
 * The `_richText: true` marker disambiguates from plain-string values that
 * sit alongside richText fields inside a mixed leaf's `strings` block.
 *
 * `_source` and `_todo` are documentation-only fields that the import
 * script reads for surfacing editor follow-ups but does not write to
 * Payload.
 */
export interface SeedRichTextField {
  _richText: true
  _source?: string
  _todo?: string
  paragraphs: SeedSegment[][]
}

export function isSeedRichTextField(value: unknown): value is SeedRichTextField {
  return (
    typeof value === 'object' && value !== null && (value as SeedRichTextField)._richText === true
  )
}

// ============================================================================
// Lexical output types
// ============================================================================

export interface LexicalTextNode {
  type: 'text'
  version: 1
  format: number
  text: string
  detail: 0
  mode: 'normal'
  style: ''
}

export interface LexicalLinkNode {
  type: 'link'
  version: 3
  format: ''
  indent: 0
  direction: null
  fields: { linkType: 'custom'; url: string; newTab: boolean }
  children: LexicalTextNode[]
}

export interface LexicalParagraphNode {
  type: 'paragraph'
  version: 1
  format: ''
  indent: 0
  direction: null
  textFormat: 0
  children: Array<LexicalTextNode | LexicalLinkNode>
}

export interface LexicalRoot {
  root: {
    type: 'root'
    version: 1
    format: ''
    indent: 0
    direction: null
    children: LexicalParagraphNode[]
  }
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Lexical text-node `format` is a bitmask; the relevant bits for the
 * basicRichTextEditor preset (Bold + Italic + Link + InlineToolbar) are:
 *
 *   bit 0 (value 1) — Bold
 *   bit 1 (value 2) — Italic
 *
 * Underline (4), strikethrough (8), code (16), subscript (32),
 * superscript (64), highlight (128) are not enabled in the editor preset
 * and the seed schema does not allow them.
 */
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2

function segmentFormatFlags(seg: SeedSegment): number {
  let f = 0
  if (seg.bold) f |= FORMAT_BOLD
  if (seg.italic) f |= FORMAT_ITALIC
  return f
}

function textNode(text: string, format = 0): LexicalTextNode {
  return { type: 'text', version: 1, format, text, detail: 0, mode: 'normal', style: '' }
}

function segmentToLexicalChild(
  seg: SeedSegment,
  ctx: string,
): LexicalTextNode | LexicalLinkNode {
  if ('type' in seg && seg.type === 'link') {
    if (!seg.href) {
      throw new Error(`[${ctx}] link segment missing href: ${JSON.stringify(seg)}`)
    }
    if (!seg.text) {
      throw new Error(`[${ctx}] link segment missing text: ${JSON.stringify(seg)}`)
    }
    return {
      type: 'link',
      version: 3,
      format: '',
      indent: 0,
      direction: null,
      fields: { linkType: 'custom', url: seg.href, newTab: false },
      children: [textNode(seg.text, segmentFormatFlags(seg))],
    }
  }
  if (typeof seg.text !== 'string') {
    throw new Error(`[${ctx}] text segment missing text: ${JSON.stringify(seg)}`)
  }
  return textNode(seg.text, segmentFormatFlags(seg))
}

/**
 * Convert a seed richText field (paragraphs of segments) to the Lexical
 * JSON tree shape that Payload's richText fields persist.
 *
 * `ctx` is a human-readable label (e.g. `"onboarding_consent_modal.body_intro"`)
 * used in error messages when an individual segment is malformed.
 */
export function seedRichTextToLexical(field: SeedRichTextField, ctx: string): LexicalRoot {
  if (!Array.isArray(field.paragraphs) || field.paragraphs.length === 0) {
    throw new Error(`[${ctx}] richText field must have a non-empty paragraphs array`)
  }
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: field.paragraphs.map((segments, paragraphIdx) => {
        if (!Array.isArray(segments) || segments.length === 0) {
          throw new Error(
            `[${ctx}] paragraph ${paragraphIdx} must be a non-empty array of segments`,
          )
        }
        return {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          textFormat: 0,
          children: segments.map((s, segmentIdx) =>
            segmentToLexicalChild(s, `${ctx}[¶${paragraphIdx}][${segmentIdx}]`),
          ),
        }
      }),
    },
  }
}

// ============================================================================
// Leaf transformation
// ============================================================================

/**
 * One leaf-group entry as written in `data.<locale>.json`.
 *
 * - Pure-string leaf: `{ key1: "value1", key2: "value2", ... }` (no `strings` block).
 * - Mixed leaf: `{ strings: { key1, key2 }, richKey1: SeedRichTextField, ... }`.
 *
 * Documentation-only keys (`_source`, `_todo`, ...) start with `_` and are
 * ignored when shaping the Payload write.
 */
export type SeedLeaf =
  | Record<string, string>
  | ({ strings: Record<string, string> } & Record<string, SeedRichTextField | string>)

/**
 * The Payload data shape that gets written to a single leaf-group field on
 * the wm-app-translations global.
 *
 * - Pure-string leaf: `Record<string, string>` — same as before Phase 1.
 * - Mixed leaf: `{ strings: Record<string, string>, richKey: LexicalRoot, ... }`
 *   matching the Payload group field that wraps the leaf post-Phase-1.
 */
export type PayloadLeafData =
  | Record<string, string>
  | ({ strings: Record<string, string> } & Record<string, LexicalRoot>)

/**
 * Convert a seed leaf to the Payload data shape, dropping `_*` metadata
 * keys and running every richText sibling through {@link seedRichTextToLexical}.
 */
export function seedLeafToPayloadData(leafName: string, leaf: SeedLeaf): PayloadLeafData {
  const stringsBlock = (leaf as { strings?: Record<string, string> }).strings
  if (!stringsBlock) {
    // Pure-string leaf.
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(leaf)) {
      if (k.startsWith('_')) continue
      if (typeof v !== 'string') {
        throw new Error(
          `[${leafName}.${k}] pure-string leaf has non-string value: ${JSON.stringify(v)}`,
        )
      }
      out[k] = v
    }
    return out
  }
  // Mixed leaf.
  const out: Record<string, Record<string, string> | LexicalRoot> = {
    strings: { ...stringsBlock },
  }
  for (const [k, v] of Object.entries(leaf)) {
    if (k === 'strings' || k.startsWith('_')) continue
    if (!isSeedRichTextField(v)) {
      throw new Error(
        `[${leafName}.${k}] sibling of "strings" is not a richText field: ${JSON.stringify(v)}`,
      )
    }
    out[k] = seedRichTextToLexical(v, `${leafName}.${k}`)
  }
  return out as PayloadLeafData
}

/**
 * Top-level seed file shape: an envelope with an optional `_meta` block
 * documenting source and conventions, plus one entry per leaf-group field.
 */
export interface SeedFile {
  _meta?: Record<string, unknown>
  [leafFieldName: string]: SeedLeaf | Record<string, unknown> | undefined
}

/**
 * Walk the seed and surface every `_todo` marker (at the leaf-group level
 * and at the richText-field level) so the importer can log them.
 */
export function collectSeedTodos(seed: SeedFile): string[] {
  const todos: string[] = []
  for (const [leafName, leaf] of Object.entries(seed)) {
    if (leafName.startsWith('_') || !leaf) continue
    const obj = leaf as Record<string, unknown>
    if (typeof obj._todo === 'string') {
      todos.push(`${leafName}: ${obj._todo}`)
    }
    for (const [k, v] of Object.entries(obj)) {
      if (isSeedRichTextField(v) && v._todo) {
        todos.push(`${leafName}.${k}: ${v._todo}`)
      }
    }
  }
  return todos
}
