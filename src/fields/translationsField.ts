import type {
  Field,
  JSONField,
  RichTextField,
  TabsField,
  UIField,
} from 'payload'

import { toWords } from 'payload/shared'

import { basicRichTextEditor } from '@/lib/richEditor'

// ============================================================================
// Types
// ============================================================================

interface StringPropertySchema {
  type: 'string'
  description?: string
}

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
 * Non-JSON-Schema extension consumed by the Payload admin builder:
 * - `screenshot`: relative path or URL (image or Figma) shown above the
 *   translation rows for translator orientation.
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
 * optional English reference + input). The field name is the (possibly
 * nested) leaf slug itself — e.g. `welcome` or `onboarding_welcome` — so
 * the data path stays flat and the legacy `welcome.strings.title` nesting
 * disappears.
 *
 * RichText keys are emitted as sibling richText fields at the tab level
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
): JSONField {
  const stringProps = Object.entries(group.properties || {}).filter(
    (entry): entry is [string, StringPropertySchema] => isStringProp(entry[1]),
  )
  const schemaEntries: SchemaEntry[] = stringProps.map(([key, prop]) => ({
    key,
    description: prop.description || '',
  }))
  const allowedKeys = new Set(stringProps.map(([key]) => key))
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
      },
    },
  }
}

function createLeafFields(leafSlug: string, group: GroupSchema, globalSlug: string): Field[] {
  const screenshot = createScreenshotField(leafSlug, group, globalSlug)
  const props = Object.entries(group.properties || {})
  const hasStringKeys = props.some(([, p]) => isStringProp(p))
  const richTextEntries = props.filter(
    (entry): entry is [string, RichTextPropertySchema] => isRichTextProp(entry[1]),
  )

  const fields: Field[] = []
  if (hasStringKeys) {
    fields.push(createStringsJsonField(leafSlug, group, globalSlug))
  }
  for (const [key, prop] of richTextEntries) {
    fields.push(createRichTextField(`${leafSlug}_${key}`, key, prop, globalSlug))
  }

  return [...(screenshot ? [screenshot] : []), ...fields]
}


// ============================================================================
// Main: buildTranslationTabs
// ============================================================================

/**
 * Converts a translations schema into PayloadCMS tabs configuration.
 *
 * Each top-level group becomes one tab; nested parent groups become a tab
 * containing inner sub-tabs. Every leaf group emits one JSON field (holding
 * its string keys) plus one richText field per richText key. The JSON field
 * is named after the (possibly nested) leaf slug — e.g. `welcome` or
 * `onboarding_welcome`. RichText keys flatten to `<leafSlug>_<key>`.
 *
 * The flat-leaf-JSON shape keeps the per-row UX from the issue spec while
 * staying under SQLite's `json_array()` argument limit, which a strict
 * one-column-per-key design would otherwise blow past on large schemas.
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

      if (subgroups.length > 0) {
        return {
          label: toWords(groupSlug.replace(/_/g, '-')),
          description: groupSchema.description,
          fields: [
            {
              type: 'tabs',
              tabs: subgroups.map(([subSlug, subSchema]) => {
                const leafSlug = `${groupSlug}_${subSlug}`
                return {
                  label: toWords(subSlug.replace(/_/g, '-')),
                  description: subSchema.description,
                  fields: createLeafFields(leafSlug, subSchema, globalSlug),
                }
              }),
            },
          ],
        }
      }

      return {
        label: toWords(groupSlug.replace(/_/g, '-')),
        description: groupSchema.description,
        fields: createLeafFields(groupSlug, groupSchema, globalSlug),
      }
    })
}
