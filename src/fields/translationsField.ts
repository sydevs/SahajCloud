import type { Field, GroupField, JSONField, RichTextField, TabsField, UIField } from 'payload'

import { basicRichTextEditor } from '@/lib/richEditor'

// ============================================================================
// Types
// ============================================================================

/**
 * Schema entry for a single string translation key.
 * Used by TranslationsTable component to render each row.
 */
export interface SchemaEntry {
  key: string
  description: string
}

/**
 * JSON Schema property definition for a plain-string translation key.
 */
interface StringPropertySchema {
  type: 'string'
  description?: string
}

/**
 * JSON Schema property definition for a rich-text translation key.
 *
 * Rendered as a Payload `richText` field using the `basicRichTextEditor`
 * preset (Bold, Italic, Link, InlineToolbar — the minimum needed for inline
 * formatting in body copy). Used for paragraphs that need inline links or
 * bold/italic spans the translator can move freely.
 */
interface RichTextPropertySchema {
  type: 'richText'
  description?: string
}

/**
 * A leaf property in the translations schema — either a string or a richText.
 */
type LeafPropertySchema = StringPropertySchema | RichTextPropertySchema

/**
 * JSON Schema definition for a group of translations.
 *
 * A group is either:
 * - a leaf group with `properties` of `LeafPropertySchema` (strings and/or
 *   richText). All-string leaves render as one tab with a flat
 *   TranslationsTable. Leaves containing at least one richText property
 *   render as a `group` field with `strings` (JSON, only string-typed entries)
 *   plus one stock Payload `richText` field per richText-typed entry.
 * - a parent group with `properties` of nested `GroupSchema` values (renders as
 *   a tab containing inner sub-tabs, one per child group).
 *
 * Mixing leaf properties and nested groups at the same level is not supported.
 *
 * Non-JSON-Schema extension fields (ignored by Monaco validation, consumed only
 * by the Payload admin builder):
 * - `screenshot`: relative path or URL to an image / Figma design that shows
 *   where the strings in this group appear in the app. Rendered above the
 *   TranslationsTable as orientation for translators. Only honoured on leaf
 *   groups — parent groups are pure containers with no UI of their own.
 *   Common forms:
 *   - "/admin-screenshots/wm-app-translations/onboarding__name.png" — repo asset
 *   - "https://www.figma.com/design/.../?node-id=11564-91404" — Figma URL link
 */
interface GroupSchema {
  type: 'object'
  description?: string
  properties?: Record<string, LeafPropertySchema | GroupSchema>
  additionalProperties?: boolean
  screenshot?: string
}

/**
 * Top-level translations schema structure.
 * Each property is a group (e.g., "common", "navigation").
 */
export interface TranslationsSchema {
  type: 'object'
  properties?: Record<string, GroupSchema>
  additionalProperties?: boolean
}

// ============================================================================
// Type guards
// ============================================================================

function isGroupSchema(
  prop: LeafPropertySchema | GroupSchema | undefined,
): prop is GroupSchema {
  return !!prop && prop.type === 'object'
}

function isStringProp(prop: LeafPropertySchema | GroupSchema): prop is StringPropertySchema {
  return prop.type === 'string'
}

function isRichTextProp(
  prop: LeafPropertySchema | GroupSchema,
): prop is RichTextPropertySchema {
  return prop.type === 'richText'
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts a slug to Title Case.
 * "common" -> "Common"
 * "navigation_links" -> "Navigation Links"
 * "user-settings" -> "User Settings"
 */
function toTitleCase(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Extracts schema entries from a leaf group's string properties.
 * Each entry contains the key and its description for the TranslationsTable component.
 * Non-string entries (richText, nested-group) are skipped — they are rendered
 * as separate fields outside the TranslationsTable.
 */
function extractSchemaEntries(
  groupProperties: Record<string, LeafPropertySchema | GroupSchema> | undefined,
): SchemaEntry[] {
  if (!groupProperties) return []

  return Object.entries(groupProperties)
    .filter(([, prop]) => isStringProp(prop))
    .map(([key, prop]) => ({
      key,
      description: prop.description || '',
    }))
}

/**
 * Creates a UI-only field that renders a screenshot or design-context link
 * above the translation table for a leaf group. Returns null when no
 * screenshot is configured so the helper can skip the entry.
 */
function createScreenshotField(
  groupSlug: string,
  groupSchema: GroupSchema,
  globalSlug: string,
): UIField | null {
  const screenshot = groupSchema.screenshot
  if (!screenshot) return null

  return {
    name: `${groupSlug}__screenshot`,
    type: 'ui',
    admin: {
      components: {
        Field: '@/components/admin/TabScreenshot',
      },
      custom: {
        screenshot,
        caption: groupSchema.description,
        globalSlug,
      },
    },
  }
}

/**
 * Creates the JSON field configuration for the string-only portion of a leaf
 * group. Field name is `strings` when the leaf is mixed (lives inside a wrapper
 * group), otherwise the leaf's own slug. Only string-typed schema properties
 * are surfaced here; richText properties become sibling fields outside this
 * JSON field.
 *
 * NOTE — the `jsonSchema` field option is deliberately NOT set here. Payload
 * compiles `jsonSchema` to a validator via Ajv (`new Ajv()` + `ajv.validate`)
 * which uses `new Function()` for performance. Cloudflare Workers' V8 isolate
 * disallows dynamic code generation, so any write to a `jsonSchema`-validated
 * field throws "Code generation from strings disallowed for this context" on
 * prod (Workers) while working fine in local dev (Node). The same `additionalProperties:
 * false` + required-keys + per-key string-type checks are now enforced by a
 * pure-JS `validate` function instead. Admin UX is unaffected: this field is
 * rendered by the custom `TranslationsTable` component, not Monaco — losing
 * Monaco's schema hints costs nothing here.
 */
function createStringsJsonField(
  fieldName: string,
  groupSchema: GroupSchema,
  globalSlug: string,
  _jsonSchemaUriSlug: string,
): JSONField {
  const schemaEntries = extractSchemaEntries(groupSchema.properties)

  const stringProperties: Record<string, StringPropertySchema> = Object.fromEntries(
    Object.entries(groupSchema.properties || {}).filter(([, prop]) => isStringProp(prop)) as Array<
      [string, StringPropertySchema]
    >,
  )
  const requiredKeys = new Set(Object.keys(stringProperties))
  const allowedKeys = new Set(Object.keys(stringProperties))
  const allowAdditional = groupSchema.additionalProperties === true

  return {
    name: fieldName,
    type: 'json',
    localized: true,
    label: false,
    admin: {
      components: {
        Field: '@/components/admin/TranslationsTable',
      },
      custom: {
        schemaEntries,
        globalSlug,
      },
    },
    validate: (value): true | string => {
      if (value === null || value === undefined) return true
      if (typeof value !== 'object' || Array.isArray(value)) {
        return 'Value must be a JSON object'
      }
      const obj = value as Record<string, unknown>
      const presentKeys = new Set(Object.keys(obj))
      if (!allowAdditional) {
        for (const key of presentKeys) {
          if (!allowedKeys.has(key)) {
            return `Unknown key "${key}" (not in schema)`
          }
        }
      }
      for (const key of requiredKeys) {
        if (!(key in obj)) {
          return `Missing required key "${key}"`
        }
        if (typeof obj[key] !== 'string') {
          return `Key "${key}" must be a string`
        }
      }
      return true
    },
  }
}

/**
 * Creates a stock Payload richText field for a single richText-typed leaf
 * property. Uses the `basicRichTextEditor` preset — Bold, Italic, Link,
 * InlineToolbar. Localized.
 */
function createRichTextSubfield(
  fieldName: string,
  property: RichTextPropertySchema,
): RichTextField {
  return {
    name: fieldName,
    type: 'richText',
    editor: basicRichTextEditor,
    localized: true,
    label: toTitleCase(fieldName),
    admin: {
      description: property.description,
    },
  }
}

/**
 * Builds the fields that represent a leaf group. The shape depends on whether
 * the leaf contains any richText properties:
 *
 * - **Pure-string leaf** → a single JSON field rendered by TranslationsTable,
 *   named after the leaf slug. Same shape and field name as the pre-richText
 *   behaviour — backward compatible.
 *
 * - **Mixed leaf** (has ≥ 1 richText) → a wrapper Payload `group` field named
 *   after the leaf slug, containing:
 *     - `strings` — JSON field rendered by TranslationsTable, holding only the
 *       string-typed entries.
 *     - one Payload `richText` field per richText-typed entry, in declaration
 *       order, each using `basicRichTextEditor`.
 *
 *   The wrapping group is necessary to keep the API/data shape predictable —
 *   `<leafSlug>: { strings: { ... }, body_intro: <lexical>, ... }`.
 */
function createLeafFields(
  leafSlug: string,
  groupSchema: GroupSchema,
  globalSlug: string,
): Field[] {
  const screenshotField = createScreenshotField(leafSlug, groupSchema, globalSlug)
  const props = groupSchema.properties || {}
  const richTextProps = Object.entries(props).filter(
    (entry): entry is [string, RichTextPropertySchema] => isRichTextProp(entry[1]),
  )
  const hasRichText = richTextProps.length > 0

  if (!hasRichText) {
    // Pure-string leaf — single JSON field, same as the previous behaviour.
    return [
      ...(screenshotField ? [screenshotField] : []),
      createStringsJsonField(leafSlug, groupSchema, globalSlug, leafSlug),
    ]
  }

  // Mixed leaf — wrap in a Payload group containing strings JSON + richText siblings.
  const richTextFields: RichTextField[] = richTextProps.map(([key, property]) =>
    createRichTextSubfield(key, property),
  )

  const wrapperGroup: GroupField = {
    name: leafSlug,
    type: 'group',
    label: false,
    fields: [
      createStringsJsonField('strings', groupSchema, globalSlug, leafSlug),
      ...richTextFields,
    ],
  }

  return [...(screenshotField ? [screenshotField] : []), wrapperGroup]
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Converts a translations schema into PayloadCMS tabs configuration.
 *
 * Top-level rules:
 * - A top-level group whose `properties` are all leaf properties (string or
 *   richText) becomes one tab; its leaf fields are emitted by createLeafFields().
 * - A top-level group whose `properties` are nested `GroupSchema` values becomes
 *   one tab containing an inner tabs field, one sub-tab per child group. Each
 *   sub-tab's leaf field name is `<parentSlug>_<childSlug>` so the global's
 *   API/data shape stays flat-ish (one top-level key per leaf group).
 *
 * Mixing leaf properties and nested groups at the same level is not supported.
 * Backward compatible: schemas with no richText properties behave exactly as
 * before — a single JSON field per leaf.
 *
 * @param schema - The translations schema (may include richText leaf properties)
 * @param globalSlug - The global's slug for API fetching and unique URIs
 * @returns Array of tab configurations for use in a TabsField
 */
export function buildTranslationTabs(
  schema: TranslationsSchema,
  globalSlug: string,
): TabsField['tabs'] {
  const properties = schema.properties || {}

  return Object.entries(properties)
    .filter(([groupSlug]) => groupSlug.trim().length > 0)
    .map(([groupSlug, groupSchema]) => {
      const groupProps = groupSchema.properties || {}
      const subgroups = Object.entries(groupProps).filter(
        (entry): entry is [string, GroupSchema] => isGroupSchema(entry[1]),
      )

      // Parent group → outer tab containing one sub-tab per child group.
      if (subgroups.length > 0) {
        return {
          label: toTitleCase(groupSlug),
          description: groupSchema.description,
          fields: [
            {
              type: 'tabs',
              tabs: subgroups.map(([subSlug, subSchema]) => {
                const leafSlug = `${groupSlug}_${subSlug}`
                return {
                  label: toTitleCase(subSlug),
                  description: subSchema.description,
                  fields: createLeafFields(leafSlug, subSchema, globalSlug),
                }
              }),
            },
          ],
        }
      }

      // Leaf group at the top level (no nesting).
      return {
        label: toTitleCase(groupSlug),
        description: groupSchema.description,
        fields: createLeafFields(groupSlug, groupSchema, globalSlug),
      }
    })
}
