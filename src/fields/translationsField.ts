import type { JsonFieldOptions } from './jsonField'
import type {
  CollapsibleField,
  Field,
  GroupField,
  JSONField,
  RichTextField,
  TabsField,
  UIField,
} from 'payload'

import { json as validateJson, toWords } from 'payload/shared'

import { basicRichTextEditor } from '@/lib/richEditor'
import { pluralStorageKeys } from '@/lib/translations/pluralCategories'


import { jsonField } from './jsonField'

// ============================================================================
// Types
// ============================================================================

interface StringPropertySchema {
  type: 'string'
  description?: string
  /**
   * Character limit for this key's on-screen UI slot (e.g. a status chip or
   * action label). Advisory by default: the admin shows a per-row reference and
   * a non-blocking over-length warning, but an over-length string still saves.
   * Set `strict: true` beside it to make the limit block the save instead.
   * Measures the raw stored string, so limit keys with `%{...}` placeholders
   * generously — the placeholder expands or contracts at render time.
   */
  maxLength?: number
  /**
   * Turns this key's `maxLength` from advisory into blocking. The limit is
   * emitted into the field's JSON Schema, so Payload's own validator refuses
   * the save, and the admin renders an error rather than a warning.
   *
   * Only meaningful beside `maxLength`. Use it where an over-length string
   * breaks a layout rather than merely looking untidy.
   */
  strict?: boolean
  /**
   * Marks a quantity-dependent string. The one declared key expands into the
   * CLDR plural family for storage (`<key>_one`/`_few`/`_many`/`_other`), and
   * the admin renders one grouped row of per-category inputs sharing a single
   * length counter. The resolver (`pluralize`) reads the same expanded keys —
   * see `docs/rules/email.md`.
   */
  plural?: boolean
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
  /** Character limit for the key's UI slot; see `StringPropertySchema`. */
  maxLength?: number
  /** When true, `maxLength` blocks the save; see `StringPropertySchema`. */
  strict?: true
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
 * Sub-group slugs the builder presents on its own terms, because the slug is a
 * shorthand rather than words.
 *
 * Everything a sub-group's slug decides about its presentation lives in this
 * one table. `toWords('a11y')` is "A11y", which tells a translator nothing —
 * and accessibility strings are long, rarely edited, and would push the
 * visible copy off the screen, so the group also starts closed. Splitting
 * those two facts (a label in the schema, a collapse rule here) would leave a
 * reader checking two places to learn how one group behaves, and every schema
 * declaring the label again with nothing pinning the copies equal.
 *
 * Presentational only: the field name, data path, and column all still come
 * from the slug.
 */
const SUBGROUP_PRESENTATION: Record<string, { initCollapsed: boolean; label: string }> = {
  a11y: { initCollapsed: true, label: 'Accessibility' },
}

/** A slug in title case (`page_tags` -> `Page Tags`). Every tab's label. */
function slugLabel(slug: string): string {
  return toWords(slug.replace(/_/g, '-'))
}

/**
 * A sub-group's presented name, else `slugLabel`.
 *
 * Only sub-groups read the table, so a tab that one day shares a slug with an
 * entry keeps its own title-case label and its own open state.
 */
function subGroupLabel(slug: string): string {
  return SUBGROUP_PRESENTATION[slug]?.label ?? slugLabel(slug)
}

/** `sy-atlas-translations` + `emails` -> `SyAtlasTranslationsEmails`. */
function pascalCase(...segments: (string | undefined)[]): string {
  return segments
    .filter((segment): segment is string => !!segment)
    .flatMap((segment) => segment.split(/[-_]/))
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/**
 * The JSON Schema for one leaf group's strings blob.
 *
 * Two things it buys, both of which the hand-rolled `validate` it replaced
 * could not: Payload generates a **named interface** per group instead of the
 * `{ [k: string]: unknown } | … | null` union every consumer had to cast away,
 * and Ajv enforces the shape on write.
 *
 * Three rules hold it together:
 *
 * - **Every property is optional.** Payload validates a stored column on every
 *   save of its document, including a save that never touched translations, so
 *   a `required` key would strand every locale that has not been translated yet.
 * - **`maxLength` appears only for a `strict` key.** An advisory limit that
 *   blocked the save would be a silent behaviour change on keys already over it.
 * - **Only standard JSON Schema keywords may appear.** Payload runs Ajv 8 in
 *   strict mode, where an unknown keyword throws at validate time rather than
 *   at boot — so `plural`, `screenshot` and `strict` must never leak in.
 *   A plural key contributes its expanded CLDR family instead of itself.
 */
export function stringsSchema({
  allowAdditional,
  fieldName,
  globalSlug,
  parentGroup,
  stringProps,
}: {
  allowAdditional: boolean
  fieldName: string
  globalSlug: string
  parentGroup?: string
  stringProps: [string, StringPropertySchema][]
}): Pick<JsonFieldOptions, 'schema' | 'schemaTitle'> {
  const schemaTitle = `${pascalCase(globalSlug, parentGroup, fieldName)}Strings`

  const properties: Record<string, { type: 'string'; description?: string; maxLength?: number }> =
    {}
  for (const [key, prop] of stringProps) {
    const property = {
      type: 'string' as const,
      ...(prop.description ? { description: prop.description } : {}),
      ...(prop.strict === true && typeof prop.maxLength === 'number'
        ? { maxLength: prop.maxLength }
        : {}),
    }
    for (const storageKey of prop.plural === true ? pluralStorageKeys(key) : [key]) {
      properties[storageKey] = property
    }
  }

  // Raw JSON Schema rather than Zod: `properties` is assembled as data from the
  // group's own entries, so building it in Zod only to convert it back would be
  // a round trip.
  return {
    schemaTitle,
    schema: {
      type: 'object',
      additionalProperties: allowAdditional,
      properties,
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
 * **The `validate` here COMPOSES Payload's built-in one — it must never
 * replace it.** Supplying a validate replaces the built-in `json` validator,
 * which is the one bound to `jsonSchema`, so a hand-rolled rule would switch
 * the whole schema off with nothing to show for it. The built-in enforces what
 * the deleted validator did (unknown keys, non-string values) plus `maxLength`
 * for a `strict` key.
 *
 * One rule it does not reach: the built-in short-circuits on an "empty" value,
 * and `[]` counts as empty (`payload/dist/fields/validations.js`), so an array
 * would land in a column whose generated type is an object. The old validator
 * rejected every array, so that check is kept ahead of the delegation.
 * See `src/collections/AGENTS.md`, "A JSON column declares its shape".
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
    strict: prop.strict === true ? true : undefined,
    plural: prop.plural === true ? true : undefined,
  }))

  return jsonField({
    name: fieldName,
    ...stringsSchema({
      allowAdditional: group.additionalProperties === true,
      fieldName,
      globalSlug,
      parentGroup,
      stringProps,
    }),
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
    validate: (value, args) => {
      if (Array.isArray(value)) return 'Value must be a JSON object'
      return validateJson(value, args)
    },
  })
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
        //
        // Each sub-group renders as a **collapsible**, not an inner tab row.
        // Tabs inside tabs hide every sub-group but one, which is the wrong
        // shape for a translator working down a page. Collapsibles are
        // presentational only: the data path and the column name are identical
        // either way (`<tab>_<sub>`), so `wm-app-translations` reads and saves
        // exactly as before and no migration is involved.
        const collapsibles: CollapsibleField[] = subgroups.map(([subSlug, subSchema]) => ({
          type: 'collapsible',
          label: subGroupLabel(subSlug),
          admin: {
            ...(subSchema.description ? { description: subSchema.description } : {}),
            // Everything not named in SUBGROUP_PRESENTATION opens.
            initCollapsed: SUBGROUP_PRESENTATION[subSlug]?.initCollapsed ?? false,
          },
          fields: createLeafFields(subSlug, subSchema, globalSlug, groupSlug),
        }))
        const groupField: GroupField = {
          name: groupSlug,
          type: 'group',
          label: false,
          fields: collapsibles,
        }
        return {
          label: slugLabel(groupSlug),
          description: groupSchema.description,
          fields: [groupField],
        }
      }

      return {
        label: slugLabel(groupSlug),
        description: groupSchema.description,
        fields: createLeafFields(groupSlug, groupSchema, globalSlug),
      }
    })
}
