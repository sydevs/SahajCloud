import type { JSONSchema4 } from 'json-schema'
import type { JSONField, TabsField } from 'payload'

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
 * JSON Schema definition for a group of translations
 */
interface GroupSchema {
  type: 'object'
  description?: string
  properties?: Record<string, StringPropertySchema>
  additionalProperties?: boolean
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
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Extracts schema entries from a group's properties
 * Each entry contains the key and its description for the TranslationsTable component
 */
function extractSchemaEntries(
  groupProperties: Record<string, StringPropertySchema> | undefined,
): SchemaEntry[] {
  if (!groupProperties) return []

  return Object.entries(groupProperties).map(([key, prop]) => ({
    key,
    description: prop.description || '',
  }))
}

/**
 * Creates a JSON field configuration for a translation group
 */
function createGroupJsonField(
  groupSlug: string,
  groupSchema: GroupSchema,
  globalSlug: string,
): JSONField {
  const schemaEntries = extractSchemaEntries(groupSchema.properties)

  // Get all property keys to mark them as required
  const requiredKeys = groupSchema.properties ? Object.keys(groupSchema.properties) : []

  // Create a standalone JSON Schema for this group
  // This allows Monaco editor validation per-tab
  const groupJsonSchema: JSONSchema4 = {
    type: 'object',
    properties: groupSchema.properties,
    required: requiredKeys.length > 0 ? requiredKeys : undefined,
    additionalProperties: groupSchema.additionalProperties ?? false,
  }

  return {
    name: groupSlug,
    type: 'json',
    localized: true,
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
 * Converts a nested translations schema into PayloadCMS tabs configuration.
 *
 * Each top-level property in the schema becomes a tab containing a JSON field
 * with the TranslationsTable component for editing.
 *
 * @param schema - The translations schema with nested groups
 * @param globalSlug - The global's slug for API fetching and unique URIs
 * @returns Array of tab configurations for use in a TabsField
 *
 * @example
 * ```typescript
 * const tabs = buildTranslationTabs(translationsSchema, 'wm-web-translations')
 *
 * // Use in global config:
 * fields: [
 *   {
 *     type: 'tabs',
 *     tabs,
 *   },
 * ]
 * ```
 */
export function buildTranslationTabs(
  schema: TranslationsSchema,
  globalSlug: string,
): TabsField['tabs'] {
  const properties = schema.properties || {}

  return Object.entries(properties)
    .filter(([groupSlug]) => groupSlug.trim().length > 0) // Skip empty group slugs
    .map(([groupSlug, groupSchema]) => ({
      label: toTitleCase(groupSlug),
      description: groupSchema.description,
      fields: [createGroupJsonField(groupSlug, groupSchema, globalSlug)],
    }))
}
