import type { JSONSchema4 } from 'json-schema'
import type { JSONField, TabsField, UIField } from 'payload'

// ============================================================================
// Types
// ============================================================================

/**
 * Schema entry for a single translation key
 * Used by TranslationsTable component to render each row
 */
export interface SchemaEntry {
  key: string
  description: string
}

/**
 * JSON Schema property definition for a string field
 */
interface StringPropertySchema {
  type: 'string'
  description?: string
}

/**
 * JSON Schema definition for a group of translations.
 *
 * A group is either:
 * - a leaf group with `properties` of `StringPropertySchema` (renders as one tab
 *   with a flat TranslationsTable), or
 * - a parent group with `properties` of nested `GroupSchema` values (renders as
 *   a tab containing inner sub-tabs, one per child group).
 *
 * Mixing string and object properties at the same level is not supported.
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
  properties?: Record<string, StringPropertySchema | GroupSchema>
  additionalProperties?: boolean
  screenshot?: string
}

/**
 * Top-level translations schema structure
 * Each property is a group (e.g., "common", "navigation")
 */
export interface TranslationsSchema {
  type: 'object'
  properties?: Record<string, GroupSchema>
  additionalProperties?: boolean
}

/**
 * Type guard: true when a property is a nested GroupSchema rather than a string leaf.
 */
function isGroupSchema(
  prop: StringPropertySchema | GroupSchema | undefined,
): prop is GroupSchema {
  return !!prop && prop.type === 'object'
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts a slug to Title Case
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
 * Any non-string (nested-group) entries are skipped — leaf groups are not expected
 * to mix strings and nested groups.
 */
function extractSchemaEntries(
  groupProperties: Record<string, StringPropertySchema | GroupSchema> | undefined,
): SchemaEntry[] {
  if (!groupProperties) return []

  return Object.entries(groupProperties)
    .filter(([, prop]) => prop.type === 'string')
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
 * Creates a JSON field configuration for a leaf translation group (one whose
 * properties are all string leaves).
 */
function createGroupJsonField(
  groupSlug: string,
  groupSchema: GroupSchema,
  globalSlug: string,
): JSONField {
  const schemaEntries = extractSchemaEntries(groupSchema.properties)

  // Only string properties are required keys on the JSON field's own schema.
  // Nested-group properties, if any, are rendered as separate sub-tabs and not
  // included in this field's value.
  const stringProperties: Record<string, StringPropertySchema> = Object.fromEntries(
    Object.entries(groupSchema.properties || {}).filter(
      ([, prop]) => prop.type === 'string',
    ) as Array<[string, StringPropertySchema]>,
  )
  const requiredKeys = Object.keys(stringProperties)

  // Create a standalone JSON Schema for this group
  // This allows Monaco editor validation per-tab
  const groupJsonSchema: JSONSchema4 = {
    type: 'object',
    properties: stringProperties,
    required: requiredKeys.length > 0 ? requiredKeys : undefined,
    additionalProperties: groupSchema.additionalProperties ?? false,
  }

  return {
    name: groupSlug,
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
    jsonSchema: {
      uri: `a://${globalSlug}/${groupSlug}.json`,
      fileMatch: [`a://${globalSlug}/${groupSlug}.json`],
      schema: groupJsonSchema,
    },
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Converts a translations schema into PayloadCMS tabs configuration.
 *
 * Top-level rules:
 * - A top-level group whose `properties` are all `string` leaves becomes one tab
 *   with a single JSON field rendered by the TranslationsTable component.
 * - A top-level group whose `properties` are nested `GroupSchema` values becomes
 *   one tab containing an inner tabs field, one sub-tab per child group. Each
 *   sub-tab's JSON field is named `<parentSlug>_<childSlug>` so the global's
 *   API/data shape stays flat (one top-level key per leaf group) — this is the
 *   same field naming the previous flat schema used.
 *
 * Mixing strings and nested groups at the same level is not supported. Backward
 * compatible: schemas with no nested groups behave exactly as before.
 *
 * @param schema - The translations schema with optional nested groups
 * @param globalSlug - The global's slug for API fetching and unique URIs
 * @returns Array of tab configurations for use in a TabsField
 */
export function buildTranslationTabs(
  schema: TranslationsSchema,
  globalSlug: string,
): TabsField['tabs'] {
  const properties = schema.properties || {}

  return Object.entries(properties)
    .filter(([groupSlug]) => groupSlug.trim().length > 0) // Skip empty group slugs
    .map(([groupSlug, groupSchema]) => {
      const groupProps = groupSchema.properties || {}
      const subgroups = Object.entries(groupProps).filter(
        (entry): entry is [string, GroupSchema] => isGroupSchema(entry[1]),
      )

      // Parent group → outer tab containing one sub-tab per child group.
      // Screenshots configured on the parent are ignored (parents are pure
      // containers); each child group renders its own optional screenshot.
      if (subgroups.length > 0) {
        return {
          label: toTitleCase(groupSlug),
          description: groupSchema.description,
          fields: [
            {
              type: 'tabs',
              tabs: subgroups.map(([subSlug, subSchema]) => {
                const leafSlug = `${groupSlug}_${subSlug}`
                const screenshotField = createScreenshotField(
                  leafSlug,
                  subSchema,
                  globalSlug,
                )
                return {
                  label: toTitleCase(subSlug),
                  description: subSchema.description,
                  fields: [
                    ...(screenshotField ? [screenshotField] : []),
                    createGroupJsonField(leafSlug, subSchema, globalSlug),
                  ],
                }
              }),
            },
          ],
        }
      }

      // Leaf group → single tab with a flat translations table, optionally
      // preceded by a screenshot for editor orientation.
      const screenshotField = createScreenshotField(groupSlug, groupSchema, globalSlug)
      return {
        label: toTitleCase(groupSlug),
        description: groupSchema.description,
        fields: [
          ...(screenshotField ? [screenshotField] : []),
          createGroupJsonField(groupSlug, groupSchema, globalSlug),
        ],
      }
    })
}
