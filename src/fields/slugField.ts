import type { CollectionSlug, FieldHook, FieldHookArgs, RowField, TextField } from 'payload'

import { slugField as payloadSlugField, ValidationError } from 'payload'
import { hasDraftsEnabled } from 'payload/shared'

import { isPublished } from '@/fields/publicUrlFields'
import { slugify } from '@/fields/slugify'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { adminOnlyCondition, adminOnlyFieldAccess } from '@/plugins/access/adminOnly'

export type SlugFieldOptions = {
  /** The field the slug is generated from. Default `title`. */
  useAsSlug?: string
  localized?: TextField['localized']
  /**
   * Whether the slug is required (defaults to Payload's `true`). Pass `false`
   * to keep the column nullable — e.g. when an existing table is backfilled
   * after the field is added, so the migration needn't enforce NOT NULL.
   */
  required?: TextField['required']
  /** Default `slug`. */
  name?: string
  /** Default `generateSlug`. */
  checkboxName?: string
  /** Default `sidebar`. */
  position?: 'sidebar'
  overrides?: (field: RowField) => RowField
  /**
   * Set it to check uniqueness before the write, so a duplicate answers 400
   * rather than surfacing the constraint violation as a 500.
   */
  collectionSlug?: string
  /** The documents allowed a blank slug, stored as `''`. */
  blankAllowed?: (args: FieldHookArgs) => boolean | Promise<boolean>
} & {
  /**
   * `{sourceField}` in it is replaced with the `useAsSlug` value.
   * @example 'URL-friendly identifier (auto-generated from {sourceField})'
   */
  description?: string
}

const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim() === ''

/**
 * Settles a blank slug (#1038, #1040), whether a caller posted it — the admin
 * Generate button posts `''` for a blank title — or the generator produced it.
 * The two hooks sit either side of Payload's own `generateSlug`, so they judge
 * the slug it leaves rather than predict it.
 *
 * - A document `blankAllowed` names keeps `''`.
 * - A page not yet live is filled from a usable source, whatever the checkbox
 *   says. Payload's generator stores `generateSlug: false` on a publish, on a
 *   posted slug, and once a draft passes two versions, and a non-admin can
 *   reset neither it nor the slug — so an untitled draft titled later could
 *   otherwise never publish.
 * - Otherwise a page not yet live gets NULL, unless this write publishes it.
 *   Only a collection with drafts can store it
 *   (Payload drops NOT NULL there), and Postgres admits many NULLs under a
 *   unique index but one `''`, which is what made every untitled draft after
 *   the first unsaveable. It is nulled before the generator too, or the
 *   autosave branch reads a posted `''` against a stored NULL as a deliberate
 *   override and never regenerates.
 * - Anything else is refused: a live page's slug, which is its public URL, and
 *   every write to a collection whose column is NOT NULL.
 */
function blankSlugHooks(options: {
  blankAllowed?: SlugFieldOptions['blankAllowed']
  slugFieldName: string
  sourceField: string
}) {
  const { blankAllowed, slugFieldName, sourceField } = options

  const nullOnDrafts: FieldHook = ({ collection, data }) => {
    if (data && isBlank(data[slugFieldName]) && collection && hasDraftsEnabled(collection)) {
      data[slugFieldName] = null
    }
    return undefined
  }

  /**
   * Whether the page is live in any locale — the slug is not localized. Read
   * from the published row (`draft: false`): on a drafts update the hook's
   * `siblingDocWithLocales` is the latest version, which a draft over a live
   * page makes look unpublished. In the write's transaction, on a copy of `req`
   * so `locale: 'all'` does not repoint the write.
   */
  const isLive = async ({ collection, operation, originalDoc, req }: FieldHookArgs) => {
    if (operation !== 'update' || !collection || originalDoc?.id == null) return false
    const live = await req.payload.findByID({
      collection: collection.slug as CollectionSlug,
      id: originalDoc.id,
      draft: false,
      locale: 'all',
      depth: 0,
      select: { _status: true },
      overrideAccess: true,
      disableErrors: true,
      trash: true,
      req: localeIsolatedReq(req),
    })
    return isPublished((live as { _status?: unknown } | null)?._status, 'all')
  }

  const settleBlank: FieldHook = async (args) => {
    const { collection, data, req } = args
    if (!data || !isBlank(data[slugFieldName])) return undefined
    if (await blankAllowed?.(args)) {
      data[slugFieldName] = ''
      return undefined
    }
    if (collection && hasDraftsEnabled(collection) && !(await isLive(args))) {
      const generated = slugify(data[sourceField] as string | undefined)
      if (generated) {
        data[slugFieldName] = generated
        return undefined
      }
      if (!isPublished(data._status, req.locale ?? undefined)) {
        data[slugFieldName] = null
        return undefined
      }
    }
    throw new ValidationError(
      {
        collection: collection?.slug,
        errors: [{ message: 'A slug is required here. Set one directly.', path: slugFieldName }],
      },
      req.t,
    )
  }

  return { before: nullOnDrafts, after: settleBlank }
}

/** Payload's own `slugField`, plus a description placeholder and the locks below. */
export function slugField(options: SlugFieldOptions = {}): RowField {
  const {
    blankAllowed,
    collectionSlug,
    description,
    overrides: userOverrides,
    ...payloadOptions
  } = options
  const sourceField = options.useAsSlug || 'title'
  const resolvedDescription = description?.replace('{sourceField}', sourceField)
  const slugFieldName = options.name ?? 'slug'

  return payloadSlugField({
    // Default for every slugField: native letters in any script, where
    // Payload's ASCII-only default would collapse a non-Latin title to empty.
    slugify: ({ valueToSlugify }) => slugify(valueToSlugify),
    ...payloadOptions,
    overrides: (field) => {
      if (resolvedDescription && field.fields[1].type === 'text') {
        field.fields[1].admin = {
          ...field.fields[1].admin,
          description: resolvedDescription,
        }
      }

      // `create` stays open so a non-admin editor can choose whether to
      // auto-generate on the first save.
      if (field.fields[0].type === 'checkbox') {
        field.fields[0].access = { ...field.fields[0].access, update: adminOnlyFieldAccess }
        field.fields[0].admin = { ...field.fields[0].admin, condition: adminOnlyCondition }
        const blank = blankSlugHooks({ blankAllowed, slugFieldName, sourceField })
        field.fields[0].hooks = {
          ...field.fields[0].hooks,
          beforeChange: [blank.before, ...(field.fields[0].hooks?.beforeChange ?? []), blank.after],
        }
      }

      // `create` stays open for the same reason as the checkbox above.
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

        // Checked here so a UNIQUE violation answers 400, not 500.
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
