import type { CollectionBeforeDeleteHook, CollectionSlug } from 'payload'

/**
 * A single cascade target: the child collection and the field on that child
 * that references the parent being deleted.
 */
export interface CascadeRule {
  /** Child collection to clean up */
  collection: CollectionSlug
  /** Field on the child collection that references the parent */
  field: string
}

/**
 * Returns a `beforeDelete` hook that deletes all child rows whose `field`
 * references the parent being deleted. Meant for composition relationships
 * ("child has no meaning without parent"), not shared-resource references.
 *
 * ## Why this exists
 *
 * PayloadCMS generates relationship FKs with `ON DELETE SET NULL`. That's
 * fine for optional references, but fatal for children whose pointer at the
 * parent is `required: true`: deleting the parent leaves child rows in a
 * broken state (`parent_id = NULL` + required-field violation) that can't be
 * loaded or saved through the admin UI. There's no config-level cascade on
 * relationship fields — see payloadcms/payload#11177 and PR #1209. This
 * helper runs before the DB-level FK so children are gone before the parent
 * row is physically removed.
 *
 * ## Trash-enabled collections
 *
 * On trash-enabled collections, `payload.delete()` still physically removes
 * the row (and fires `beforeDelete`) — soft-delete is a separate code path
 * implemented as `payload.update({ data: { deletedAt } })`. So this helper
 * runs whenever a parent is actually deleted, whether or not it was trashed
 * first. We pass `trash: true` on the child delete so already-trashed
 * children are also physically removed — otherwise the parent's own physical
 * delete would trip on stale FK references.
 *
 * ## Example
 *
 * ```typescript
 * export const Lectures: CollectionConfig = {
 *   hooks: {
 *     beforeDelete: [
 *       deleteChildren({ collection: 'lecture-clips', field: 'lecture' }),
 *     ],
 *   },
 * }
 * ```
 */
export function deleteChildren(
  ...rules: CascadeRule[]
): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    for (const rule of rules) {
      await req.payload.delete({
        collection: rule.collection,
        where: { [rule.field]: { equals: id } },
        trash: true,
        req,
      })
    }
  }
}
