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
 * Lexical text-node `format` is a bitmask. The relevant bits for the
 * basicRichTextEditor preset (Bold, Italic, Link, InlineToolbar) are:
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
 * `ctx` is a human-readable label (for example, `"onboarding_consent_modal.body_intro"`)
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
 * Field values extracted from a single seed leaf, decoupled from how Payload
 * names/places them. `strings` is the flat `{ key: value }` map for the leaf's
 * JSON field (or null when the leaf has no string keys). `richText` maps each
 * richText key (bare, for example, `legal_disclaimer`) to its Lexical tree.
 *
 * Handles both pure-string leaves (no `strings` block) and mixed leaves
 * (`{ strings: {...}, richKey: SeedRichTextField, ... }`).
 */
export function seedLeafToFieldValues(
  leafSlug: string,
  leaf: SeedLeaf,
): { strings: Record<string, string> | null; richText: Record<string, LexicalRoot> } {
  const stringsBlock = (leaf as { strings?: Record<string, string> }).strings
  const richText: Record<string, LexicalRoot> = {}

  if (!stringsBlock) {
    // Pure-string leaf — keys live directly on the object.
    const stringKeys: Record<string, string> = {}
    for (const [k, v] of Object.entries(leaf)) {
      if (k.startsWith('_')) continue
      if (typeof v !== 'string') {
        throw new Error(
          `[${leafSlug}.${k}] pure-string leaf has non-string value: ${JSON.stringify(v)}`,
        )
      }
      stringKeys[k] = v
    }
    return { strings: Object.keys(stringKeys).length > 0 ? stringKeys : null, richText }
  }

  // Mixed leaf. The `strings` block holds string keys. Siblings are richText fields.
  for (const [k, v] of Object.entries(leaf)) {
    if (k === 'strings' || k.startsWith('_')) continue
    if (!isSeedRichTextField(v)) {
      throw new Error(
        `[${leafSlug}.${k}] sibling of "strings" is not a richText field: ${JSON.stringify(v)}`,
      )
    }
    richText[k] = seedRichTextToLexical(v, `${leafSlug}.${k}`)
  }
  return { strings: Object.keys(stringsBlock).length > 0 ? { ...stringsBlock } : null, richText }
}

// ============================================================================
// Schema-driven placement
// ============================================================================

interface SchemaLeafProp {
  type: 'string' | 'richText'
  description?: string
}
interface SchemaGroupNode {
  type: 'object'
  description?: string
  properties?: Record<string, SchemaLeafProp | SchemaGroupNode>
}
export interface TranslationsSchemaRoot {
  type: 'object'
  properties?: Record<string, SchemaGroupNode>
}

function isSchemaGroup(node: SchemaLeafProp | SchemaGroupNode): node is SchemaGroupNode {
  return node.type === 'object'
}

/**
 * Build the `payload.updateGlobal({ data })` payload for a translations global
 * from its seed file, driven by the schema so the shape matches
 * `buildTranslationTabs()` exactly.
 *
 * - Simple tab `navigation`: strings → `data.navigation`, richText `rt` →
 *   `data.navigation_rt` (no group wrapper).
 * - Nested tab `onboarding` (has sub-groups): wrapped in a Payload group named
 *   after the tab, so strings for sub-group `welcome` → `data.onboarding.welcome`
 *   and richText `legal_disclaimer` → `data.onboarding.welcome_legal_disclaimer`
 *   (the sub-slug prefix is kept. The group supplies the tab namespace.)
 *
 * Seed leaf slugs are flat (`onboarding_welcome`). Walking the schema avoids
 * having to guess the tab/sub-group boundary from the slug.
 */
export function buildWmAppGlobalData(
  seed: SeedFile,
  schema: TranslationsSchemaRoot,
): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  const tabs = schema.properties ?? {}

  for (const [tabSlug, tabNode] of Object.entries(tabs)) {
    const tabProps = tabNode.properties ?? {}
    const isNested = Object.values(tabProps).some(isSchemaGroup)

    if (!isNested) {
      const leaf = seed[tabSlug] as SeedLeaf | undefined
      if (!leaf) continue
      const { strings, richText } = seedLeafToFieldValues(tabSlug, leaf)
      if (strings) data[tabSlug] = strings
      for (const [rtKey, lexical] of Object.entries(richText)) {
        data[`${tabSlug}_${rtKey}`] = lexical
      }
      continue
    }

    const group: Record<string, unknown> = {}
    for (const [subSlug, subNode] of Object.entries(tabProps)) {
      if (!isSchemaGroup(subNode)) continue
      const leaf = seed[`${tabSlug}_${subSlug}`] as SeedLeaf | undefined
      if (!leaf) continue
      const { strings, richText } = seedLeafToFieldValues(`${tabSlug}_${subSlug}`, leaf)
      if (strings) group[subSlug] = strings
      for (const [rtKey, lexical] of Object.entries(richText)) {
        group[`${subSlug}_${rtKey}`] = lexical
      }
    }
    if (Object.keys(group).length > 0) data[tabSlug] = group
  }

  return data
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
