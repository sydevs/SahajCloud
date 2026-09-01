import type { Field, GroupField, JSONField, RichTextField, TabsField, UIField } from 'payload'

import { toWords } from 'payload/shared'

import { basicRichTextEditor } from '@/lib/richEditor'

// ============================================================================
// Types
// ============================================================================

interface StringPropertySchema {
  type: 'string'
  description?: string
  /**
   * Soft character limit for this key's on-screen UI slot (e.g. a status chip
   * or action label). Advisory only: the admin shows a per-row reference and a
   * non-blocking over-length warning, but an over-length string still saves.
   * Measures the raw stored string, so limit keys with `%{...}` placeholders
   * generously — the placeholder expands or contracts at render time.
   */
  maxLength?: number
  /**
   * Marks a quantity-dependent string. The one declared key expands into the
   * CLDR plural family for storage (`<key>_one`/`_few`/`_many`/`_other`), and
   * the admin renders one grouped row of per-category inputs sharing a single
   * length counter. The resolver (`pluralize`) reads the same expanded keys —
   * see `src/plugins/email/AGENTS.md`.
   */
  plural?: boolean
}

/**
 * CLDR plural categories a translation key expands into when `plural: true`.
 * The union across the app's locales (English needs only one/other; Russian,
 * Ukrainian, and Czech add few/many). `EMAIL_STRING_DEFAULTS` must define the
 * whole family for every plural key in the `emails` group, else `withDefaults`
 * drops a translated form — a guard test in `translations-field.int.spec.ts`
 * enforces that sync against this exported constant.
 */
export const PLURAL_CATEGORIES = ['one', 'few', 'many', 'other'] as const

interface RichTextPropertySchema {
  type: 'richText'
  description?: string
}

type LeafPropertySchema = StringPropertySchema | RichTextPropertySchema

/**
 * JSON Schema definition for a group of translations.
 *
 * A group is either a leaf group whose `properties` are `LeafPropertySchema`
 * entries (string and/or richText), or a parent group whose `properties` are
 * nested `GroupSchema` values. Mixing leaf properties and nested groups at
 * the same level is not supported.
 *
 * Non-JSON-Schema extensions consumed by the Payload admin builder:
 * - `screenshot` (group level): relative path or URL (image or Figma) shown
 *   above the translation rows for translator orientation.
 * - `maxLength` (string-key level, see `StringPropertySchema`): soft per-key
 *   character limit surfaced as a reference + non-blocking over-length warning.
 * - `plural` (string-key level, see `StringPropertySchema`): expands one key
 *   into the CLDR plural family and renders a grouped per-category row.
 */
interface GroupSchema {
  type: 'object'
  description?: string
  properties?: Record<string, LeafPropertySchema | GroupSchema>
  additionalProperties?: boolean
  screenshot?: string
}

export interface TranslationsSchema {
  type: 'object'
  properties?: Record<string, GroupSchema>
  additionalProperties?: boolean
}

/**
 * One entry per string-typed translation key in a leaf group. Consumed by
 * TranslationsRow to render the title + (optional) English reference + input.
 */
export interface SchemaEntry {
  key: string
  description: string
  /** Soft character limit for the key's UI slot; see `StringPropertySchema`. */
  maxLength?: number
  /** When true, this key holds a CLDR plural family; see `StringPropertySchema`. */
  plural?: boolean
}

// ============================================================================
// Type guards
// ============================================================================

function isGroupSchema(prop: LeafPropertySchema | GroupSchema | undefined): prop is GroupSchema {
  return !!prop && prop.type === 'object'
}

function isStringProp(prop: LeafPropertySchema | GroupSchema): prop is StringPropertySchema {
  return prop.type === 'string'
}

function isRichTextProp(prop: LeafPropertySchema | GroupSchema): prop is RichTextPropertySchema {
  return prop.type === 'richText'
}

// ============================================================================
// Helpers
// ============================================================================

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
      components: { Field: '@/components/admin/TabScreenshot' },
      custom: {
        screenshot,
        caption: groupSchema.description,
        globalSlug,
      },
    },
  }
}

/**
 * One localized JSON field per leaf group, holding every string-typed key in
 * that group as flat `{ key: value }` pairs. Rendered by TranslationsRow,
 * which displays each schema entry as its own row (title + description +
 * optional English reference + input). For simple tabs, the field name is
 * the tab slug (e.g. `navigation`). For nested tabs wrapped in a group, the
 * field name is the sub-group slug (e.g. `welcome`) and `parentGroup` is the
 * group name (e.g. `onboarding`), so the data path is `onboarding.welcome`.
 *
 * RichText keys are emitted as sibling richText fields at the same level
 * (see createRichTextField), not packed into this JSON blob.
 *
 * NOTE — no `jsonSchema` is set. Payload would compile it to a validator via
 * Ajv which uses `new Function()` for performance. Cloudflare Workers' V8
 * isolate disallows dynamic code generation, so any write to a
 * `jsonSchema`-validated field throws "Code generation from strings
 * disallowed" in prod. A pure-JS `validate` function enforces the same
 * key/type constraints instead.
 */
function createStringsJsonField(
  fieldName: string,
  group: GroupSchema,
  globalSlug: string,
  parentGroup?: string,
): JSONField {
  const stringProps = Object.entries(group.properties || {}).filter(
    (entry): entry is [string, StringPropertySchema] => isStringProp(entry[1]),
  )
  const schemaEntries: SchemaEntry[] = stringProps.map(([key, prop]) => ({
    key,
    description: prop.description || '',
    maxLength: prop.maxLength,
    plural: prop.plural === true ? true : undefined,
  }))
  // A plural key is declared once but stored as its CLDR family, so the JSON
  // blob holds `<key>_one`/`_few`/… — validate against the expanded keys.
  const allowedKeys = new Set(
    stringProps.flatMap(([key, prop]) =>
      prop.plural === true ? PLURAL_CATEGORIES.map((cat) => `${key}_${cat}`) : [key],
    ),
  )
  const allowAdditional = group.additionalProperties === true

  return {
    name: fieldName,
    type: 'json',
    localized: true,
    label: false,
    admin: {
      components: { Field: '@/components/admin/TranslationsRow' },
      custom: {
        schemaEntries,
        globalSlug,
        parentGroup,
      },
    },
    validate: (value): true | string => {
      if (value === null || value === undefined) return true
      if (typeof value !== 'object' || Array.isArray(value)) return 'Value must be a JSON object'
      const obj = value as Record<string, unknown>
      if (!allowAdditional) {
        for (const key of Object.keys(obj)) {
          if (!allowedKeys.has(key)) return `Unknown key "${key}" (not in schema)`
        }
      }
      for (const key of allowedKeys) {
        if (!(key in obj)) continue
        if (typeof obj[key] !== 'string') return `Key "${key}" must be a string`
      }
      return true
    },
  }
}

/**
 * Creates a localized richText field for a single richText key. Uses the
 * `basicRichTextEditor` preset (Bold, Italic, Link, InlineToolbar). The
 * Description slot renders the translation title + English reference above
 * the standard Lexical editor.
 */
function createRichTextField(
  fieldName: string,
  translationKey: string,
  prop: RichTextPropertySchema,
  globalSlug: string,
  parentGroup?: string,
): RichTextField {
  return {
    name: fieldName,
    type: 'richText',
    editor: basicRichTextEditor,
    localized: true,
    label: toWords(translationKey.replace(/_/g, '-')),
    admin: {
      description: prop.description,
      components: { Field: '@/components/admin/TranslationsRow#TranslationsRichTextField' },
      custom: {
        translationKey,
        globalSlug,
        fieldType: 'richText',
        parentGroup,
      },
    },
  }
}

function createLeafFields(
  leafSlug: string,
  group: GroupSchema,
  globalSlug: string,
  parentGroup?: string,
): Field[] {
  const screenshot = createScreenshotField(leafSlug, group, globalSlug)
  const props = Object.entries(group.properties || {})
  const hasStringKeys = props.some(([, p]) => isStringProp(p))
  const richTextEntries = props.filter((entry): entry is [string, RichTextPropertySchema] =>
    isRichTextProp(entry[1]),
  )

  const fields: Field[] = []
  if (hasStringKeys) {
    fields.push(createStringsJsonField(leafSlug, group, globalSlug, parentGroup))
  }
  // Postgres truncates identifiers to 63 bytes. Each richText key becomes its
  // own column named `<parentGroup>_<leafSlug>_<key>`, and the drafts/versions
  // table prefixes every column with `version_` (8 chars). So keep the base
  // column name (`<parentGroup>_<leafSlug>_<key>`) ≤ 55 chars — otherwise the
  // version-table column overflows 63, Postgres silently truncates it, and dev
  // `push:true` then emits an impossible self-colliding `RENAME COLUMN` on
  // boot. String keys are exempt (packed into one JSON blob, no per-key column).
  // Shorten an over-long group/key slug rather than relying on truncation.
  for (const [key, prop] of richTextEntries) {
    fields.push(createRichTextField(`${leafSlug}_${key}`, key, prop, globalSlug, parentGroup))
  }

  return [...(screenshot ? [screenshot] : []), ...fields]
}

// ============================================================================
// Main: buildTranslationTabs
// ============================================================================

/**
 * Converts a translations schema into PayloadCMS tabs configuration.
 *
 * Each top-level group becomes one tab. Simple tabs (leaf group only) emit
 * one JSON field named after the tab slug. Nested tabs (containing sub-groups)
 * wrap their fields in a Payload group named after the tab slug, so the API
 * response is `{ onboarding: { welcome: {…}, user_type: {…} } }` instead of
 * the flat `{ onboarding_welcome: {…}, onboarding_user_type: {…} }`. The
 * underlying SQLite column names are identical in both cases (`group_field`
 * matches the old `leafSlug` naming), so no migration is required.
 *
 * Every leaf group emits one JSON field (holding string keys) plus one
 * richText field per richText key. The flat-leaf-JSON shape keeps the per-row
 * UX while staying under SQLite's `json_array()` argument limit.
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
      const subgroups = Object.entries(groupProps).filter((entry): entry is [string, GroupSchema] =>
        isGroupSchema(entry[1]),
      )

      if (subgroups.length > 0) {
        // Wrap sub-group fields in a group named after the tab slug so the
        // API response is namespaced: { onboarding: { welcome: {…} } }
        const groupField: GroupField = {
          name: groupSlug,
          type: 'group',
          label: false,
          fields: [
            {
              type: 'tabs',
              tabs: subgroups.map(([subSlug, subSchema]) => ({
                label: toWords(subSlug.replace(/_/g, '-')),
                description: subSchema.description,
                fields: createLeafFields(subSlug, subSchema, globalSlug, groupSlug),
              })),
            },
          ],
        }
        return {
          label: toWords(groupSlug.replace(/_/g, '-')),
          description: groupSchema.description,
          fields: [groupField],
        }
      }

      return {
        label: toWords(groupSlug.replace(/_/g, '-')),
        description: groupSchema.description,
        fields: createLeafFields(groupSlug, groupSchema, globalSlug),
      }
    })
}
