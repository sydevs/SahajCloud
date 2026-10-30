import type { CollectionSlug, FieldHook, RowField, TextField } from 'payload'

import { slugField as payloadSlugField, ValidationError } from 'payload'
import { hasDraftsEnabled } from 'payload/shared'

import { slugifyValue } from '@/lib/utilities/slugify'
import { adminOnlyCondition, adminOnlyFieldAccess } from '@/plugins/access/adminOnly'

/**
 * Options for creating a slug field.
 * Based on Payload's internal SlugFieldArgs type.
 */
export type SlugFieldOptions = {
  /** Field to use for generating the slug */
  useAsSlug?: string
  /** Enable localization for the slug field */
  localized?: TextField['localized']
  /**
   * Whether the slug is required (defaults to Payload's `true`). Pass `false`
   * to keep the column nullable — e.g. when an existing table is backfilled
   * after the field is added, so the migration needn't enforce NOT NULL.
   */
  required?: TextField['required']
  /** Override for the slug field name (default: 'slug') */
  name?: string
  /** Override for the checkbox field name (default: 'generateSlug') */
  checkboxName?: string
  /** Position of the slug field in admin UI (default: 'sidebar') */
  position?: 'sidebar'
  /** Custom overrides function for granular field customization */
  overrides?: (field: RowField) => RowField
  /**
   * Collection slug to enable application-layer uniqueness validation.
   * When set, a validate function is added that checks for duplicate slugs
   * before the DB write, converting 500 constraint errors into 400 validation errors.
   */
  collectionSlug?: string
} & {
  /**
   * Description text for the slug field.
   * Use {sourceField} as a placeholder that will be replaced with the useAsSlug value.
   * @example 'URL-friendly identifier (auto-generated from {sourceField})'
   */
  description?: string
}

const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim() === ''

/**
 * Wraps Payload's `generateSlug` so a blank slug never reaches the database
 * (#1038, #1040) — whether the caller posted it (the admin Generate button
 * posts `''` for a blank title) or the generator produced it. It judges the
 * slug the generator leaves, so it needs no copy of the generator's rules.
 *
 * - With drafts, the column is nullable and a blank is written as NULL:
 *   Postgres admits many NULLs under a unique index but one `''`, and draft
 *   saves skip validation, so nothing else could refuse it. It is nulled
 *   before the generator runs too, or the autosave branch reads a posted `''`
 *   against a stored NULL as a deliberate override and never regenerates.
 * - Without drafts, the column is NOT NULL, so a blank is refused — unless the
 *   slug was already blank, which the nested-docs cascade re-saves verbatim
 *   (`src/collections/Regions/nonEmptySlug.ts`).
 */
function settleBlankSlug(generateSlug: FieldHook, slugFieldName: string, sourceField: string) {
  const settle: FieldHook = async (args) => {
    const { collection, data, operation, originalDoc, req } = args
    const nullable = Boolean(collection && hasDraftsEnabled(collection))
    if (nullable && data && isBlank(data[slugFieldName])) data[slugFieldName] = null

    const checkbox = await generateSlug(args)

    if (!data || !isBlank(data[slugFieldName])) return checkbox
    if (nullable) {
      data[slugFieldName] = null
      return checkbox
    }
    if (operation === 'update' && isBlank(originalDoc?.[slugFieldName])) return checkbox
    throw new ValidationError(
      {
        collection: collection?.slug,
        errors: [
          {
            message: `A slug is required. Set one, or give this document a ${sourceField} it can be generated from.`,
            path: slugFieldName,
          },
        ],
      },
      req.t,
    )
  }
  return settle
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
  const { collectionSlug, description, overrides: userOverrides, ...payloadOptions } = options
  const sourceField = options.useAsSlug || 'title'
  const resolvedDescription = description?.replace('{sourceField}', sourceField)
  const slugFieldName = options.name ?? 'slug'

  return payloadSlugField({
    // Default for every slugField: transliterating slugify so non-Latin titles /
    // names (Cyrillic, …) produce readable ASCII slugs instead of collapsing to
    // empty under Payload's ASCII-only default.
    slugify: ({ valueToSlugify }) => slugifyValue(valueToSlugify),
    ...payloadOptions,
    overrides: (field) => {
      // Apply description if provided
      if (resolvedDescription && field.fields[1].type === 'text') {
        field.fields[1].admin = {
          ...field.fields[1].admin,
          description: resolvedDescription,
        }
      }

      // Lock the generateSlug checkbox: hide from non-admins in UI, and block
      // update via the API. create is intentionally left open so non-admin
      // editors can choose whether to auto-generate on first save.
      if (field.fields[0].type === 'checkbox') {
        field.fields[0].access = { ...field.fields[0].access, update: adminOnlyFieldAccess }
        field.fields[0].admin = { ...field.fields[0].admin, condition: adminOnlyCondition }
        field.fields[0].hooks = {
          ...field.fields[0].hooks,
          beforeChange: (field.fields[0].hooks?.beforeChange ?? []).map((generateSlug) =>
            settleBlankSlug(generateSlug, slugFieldName, sourceField),
          ),
        }
      }

      // Lock the slug text field on update. create is intentionally left open
      // so non-admin editors can still populate the slug when creating a doc.
      // The custom Field component hides unlock/generate buttons for non-admins.
      if (field.fields[1].type === 'text') {
        field.fields[1].access = { ...field.fields[1].access, update: adminOnlyFieldAccess }
        field.fields[1].admin = {
          ...field.fields[1].admin,
          custom: {
            ...((field.fields[1].admin?.custom as Record<string, unknown>) ?? {}),
            useAsSlug: sourceField,
          },
          components: {
            ...(field.fields[1].admin?.components ?? {}),
            Field: '@/components/admin/LockedSlugField',
          },
        }

        // Application-layer uniqueness check so D1 UNIQUE constraint violations
        // surface as 400 validation errors instead of 500 DB errors.
        if (collectionSlug) {
          field.fields[1].validate = (async (
            value: string | null | undefined,
            opts: {
              id?: string | number | null
              req?: { payload?: { find: (...args: unknown[]) => Promise<{ totalDocs: number }> } }
            },
          ) => {
            const { id, req } = opts
            if (!value || !req?.payload) return true
            const existing = await req.payload.find({
              collection: collectionSlug as CollectionSlug,
              where: {
                and: [
                  { [slugFieldName]: { equals: value } },
                  ...(id != null ? [{ id: { not_equals: id } }] : []),
                ],
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            } as unknown)
            return existing.totalDocs > 0
              ? 'This slug is already in use. Please choose a different one.'
              : true
          }) as TextField['validate']
        }
      }

      return userOverrides ? userOverrides(field) : field
    },
  })
}
