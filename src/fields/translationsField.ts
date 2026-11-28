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
import { previewTargetField, type PreviewTarget } from './previewTargetField'

// --- Types ---

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
   * Turns this key's `maxLength` from advisory into blocking: the limit reaches
   * the field's JSON Schema, so Payload's own validator refuses the save.
   *
   * Use it where an over-length string breaks a layout rather than merely
   * looking untidy.
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
  /**
   * The key's English copy, and the only place a new key's English goes. The
   * seed importer merges it under `data.en.json` for a fresh database, and
   * `reconcileEnglishDefaults` (`src/lib/translations/englishDefaults.ts`)
   * fills it into one that already exists.
   *
   * Never on a `plural` key: its English is a family, not a value.
   */
  default?: string
}

interface RichTextPropertySchema {
  type: 'richText'
  description?: string
}

type LeafPropertySchema = StringPropertySchema | RichTextPropertySchema

/**
 * A group is **either** a leaf group whose `properties` are `LeafPropertySchema`
 * entries, **or** a parent group whose `properties` are nested `GroupSchema`
 * values. Mixing the two at one level is not supported.
 *
 * `screenshot`, `preview`, `maxLength`, `plural` and `default` are extensions
 * the Payload admin builder reads, not JSON Schema keywords.
 */
interface GroupSchema {
  type: 'object'
  description?: string
  properties?: Record<string, LeafPropertySchema | GroupSchema>
  additionalProperties?: boolean
  screenshot?: string
  /**
   * Where the Live Preview panel points while this tab is open. Top-level
   * groups only — a sub-group renders as a collapsible, which mounts whether or
   * not it is open, so it cannot tell the panel anything.
   */
  preview?: PreviewTarget
}

export interface TranslationsSchema {
  type: 'object'
  properties?: Record<string, GroupSchema>
  additionalProperties?: boolean
}

/** One entry per string-typed key in a leaf group, read by TranslationsRow. */
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

// --- Type guards ---

function isGroupSchema(prop: LeafPropertySchema | GroupSchema | undefined): prop is GroupSchema {
  return !!prop && prop.type === 'object'
}

function isStringProp(prop: LeafPropertySchema | GroupSchema): prop is StringPropertySchema {
  return prop.type === 'string'
}

function isRichTextProp(prop: LeafPropertySchema | GroupSchema): prop is RichTextPropertySchema {
  return prop.type === 'richText'
}

// --- Helpers ---

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

/** `page_tags` -> `Page Tags`. Every tab's label. */
function slugLabel(slug: string): string {
  return toWords(slug.replace(/_/g, '-'))
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
 * The JSON Schema for one leaf group's strings blob. It buys a **named
 * interface** per group in `payload-types.ts`, and Ajv enforcing the shape on
 * write.
 *
 * Four rules hold it together:
 *
 * - **Every property is optional.** Payload validates a stored column on every
 *   save of its document, including a save that never touched translations, so
 *   a `required` key would strand every locale not yet translated.
 * - **`maxLength` appears only for a `strict` key**, or an advisory limit would
 *   block the save on keys already over it.
 * - **Only standard JSON Schema keywords may appear.** Payload runs Ajv 8 in
 *   strict mode, where an unknown keyword throws at validate time rather than
 *   at boot — so `plural`, `screenshot` and `strict` must never leak in.
 *   A plural key contributes its expanded CLDR family instead of itself.
 * - **`default` stays out too, though it is a standard keyword.** Under
 *   `useDefaults` Ajv writes a declared default into the data it validates, so
 *   emitting it would store copy nobody typed. `reconcileEnglishDefaults` is
 *   what delivers one instead.
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

  // Raw JSON Schema rather than Zod: `properties` is assembled as data, which
  // Zod would only convert back.
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
 * One localized JSON field per leaf group, holding that group's string keys as
 * flat `{ key: value }` pairs. RichText keys become sibling richText fields at
 * the same level instead.
 *
 * **The `validate` here COMPOSES Payload's built-in one — it must never
 * replace it.** Supplying a validate replaces the built-in `json` validator,
 * which is the one bound to `jsonSchema`, so a hand-rolled rule would switch
 * the whole schema off with nothing to show for it.
 *
 * One rule it does not reach: the built-in short-circuits on an "empty" value,
 * and `[]` counts as empty (`payload/dist/fields/validations.js`), so an array
 * would land in a column whose generated type is an object. Hence the array
 * check ahead of the delegation. See `src/collections/AGENTS.md`, "A JSON
 * column declares its shape".
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

/** The Description slot carries the translation title and English reference. */
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

// --- Main: buildTranslationTabs ---

/**
 * One tab per top-level group.
 *
 * A group holding sub-groups wraps them in a Payload group named after the tab
 * slug, so the API response is namespaced (`{ onboarding: { welcome: {…} } }`)
 * rather than flat. The column name is `<tab>_<sub>` either way.
 *
 * One JSON field per leaf group rather than a column per key: that keeps the
 * per-row UX while staying under SQLite's `json_array()` argument limit.
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
      // First in the tab, so the panel repoints as the tab opens rather than
      // after the translator has scrolled.
      const previewFields = groupSchema.preview
        ? [previewTargetField(groupSchema.preview, `${groupSlug}__preview_target`)]
        : []

      if (subgroups.length > 0) {
        // A collapsible, not an inner tab row: tabs inside tabs hide every
        // sub-group but one, which is the wrong shape for a translator working
        // down a page.
        const collapsibles: CollapsibleField[] = subgroups.map(([subSlug, subSchema]) => ({
          type: 'collapsible',
          label: slugLabel(subSlug),
          admin: {
            ...(subSchema.description ? { description: subSchema.description } : {}),
            initCollapsed: false,
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
          fields: [...previewFields, groupField],
        }
      }

      return {
        label: slugLabel(groupSlug),
        description: groupSchema.description,
        fields: [...previewFields, ...createLeafFields(groupSlug, groupSchema, globalSlug)],
      }
    })
}
