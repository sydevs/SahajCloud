import type { RowField, TextField } from 'payload'

import { slugField as payloadSlugField } from 'payload'

/**
 * Options for creating a slug field.
 * Based on Payload's internal SlugFieldArgs type.
 */
export type SlugFieldOptions = {
  /** Field to use for generating the slug */
  useAsSlug?: string
  /** Enable localization for the slug field */
  localized?: TextField['localized']
  /** Override for the slug field name (default: 'slug') */
  name?: string
  /** Override for the checkbox field name (default: 'generateSlug') */
  checkboxName?: string
  /** Position of the slug field in admin UI (default: 'sidebar') */
  position?: 'sidebar'
  /** Custom overrides function for granular field customization */
  overrides?: (field: RowField) => RowField
} & {
  /**
   * Description text for the slug field.
   * Use {sourceField} as a placeholder that will be replaced with the useAsSlug value.
   * @example 'URL-friendly identifier (auto-generated from {sourceField})'
   */
  description?: string
}

/**
 * Creates a slug field with simplified description handling.
 * Wraps Payload's built-in slugField to provide an easier API for adding field descriptions.
 *
 * @example Basic usage (same as Payload's slugField)
 * ```typescript
 * slugField({ useAsSlug: 'title' })
 * ```
 *
 * @example With description using placeholder
 * ```typescript
 * slugField({
 *   useAsSlug: 'title',
 *   description: 'URL-friendly identifier (auto-generated from {sourceField})',
 * })
 * // Results in: "URL-friendly identifier (auto-generated from title)"
 * ```
 */
export function slugField(options: SlugFieldOptions = {}): RowField {
  const { description, overrides: userOverrides, ...payloadOptions } = options
  const sourceField = options.useAsSlug || 'title'

  if (!description) {
    return payloadSlugField({ ...payloadOptions, overrides: userOverrides })
  }

  const resolvedDescription = description.replace('{sourceField}', sourceField)

  return payloadSlugField({
    ...payloadOptions,
    overrides: (field) => {
      if (field.fields[1].type === 'text') {
        field.fields[1].admin = {
          ...field.fields[1].admin,
          description: resolvedDescription,
        }
      }
      return userOverrides ? userOverrides(field) : field
    },
  })
}
