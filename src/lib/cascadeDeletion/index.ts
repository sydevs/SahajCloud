import type { CollectionBeforeDeleteHook, CollectionSlug, PayloadRequest } from 'payload'

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
 * A **polymorphic** child field is the same job needing a different `where`,
 * and the hook reads that off the child's own schema — see `polymorphicField`.
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
 * export const Albums: CollectionConfig = {
 *   hooks: {
 *     beforeDelete: [
 *       deleteChildren({ collection: 'songs', field: 'album' }),
 *     ],
 *   },
 * }
 * ```
 */
/**
 * The hook, carrying the rules it was built with.
 *
 * ⚠ **Read by `CleanupOrphanedMedia`, which must not mistake a child for a
 * user.** A cascade child's pointer at its parent is deleted *with* the
 * parent, so it can never be the reason the parent is still in use — but the
 * orphan sweep discovers references by walking every collection's fields, and
 * `transcripts.source` reads exactly like a reference to the `files` row it
 * depends on. Without this, one cue row made a recording immortal: no lesson
 * referenced it in any locale, and the nightly sweep still counted it in use
 * (#1016). The rules are published here rather than restated there, so a new
 * cascade cannot arm the same leak silently.
 */
export type CascadeHook = CollectionBeforeDeleteHook & {
  cascadeRules: readonly CascadeRule[]
}

export function deleteChildren(...rules: CascadeRule[]): CascadeHook {
  const cascade: CollectionBeforeDeleteHook = async ({ collection, id, req }) => {
    for (const rule of rules) {
      await req.payload.delete({
        collection: rule.collection,
        where: {
          [rule.field]: polymorphicField(req, rule)
            ? { equals: { relationTo: collection.slug, value: id } }
            : { equals: id },
        },
        // Nothing reads the deleted rows, and the config's `defaultDepth` would
        // populate every child's relationships on the way out. A `select` would
        // also skip the children's virtual fields, but its type is per
        // collection and this helper is generic.
        depth: 0,
        trash: true,
        req,
      })
    }
  }

  return Object.assign(cascade, { cascadeRules: rules })
}

/**
 * Whether the child's referencing field is polymorphic, read off the child's
 * own config.
 *
 * ⚠ **Derived, never declared.** The object form needs the parent's slug, and
 * that is the collection this hook is registered on — so a rule free to state
 * it is free to state the wrong one, which compiles, deletes nothing, and
 * leaves the parent's delete to fail on the foreign key. The repo answers every
 * other "what shape is this column" question the same way
 * (`isLocaleScopedCollection`, `getDocManagerFields`).
 *
 * `flattenedFields`, because sanitization splices a row, a collapsible or an
 * unnamed group straight into the top level. A dotted `field` reaches no
 * top-level entry, so it keeps the single-target form.
 */
function polymorphicField(req: PayloadRequest, rule: CascadeRule): boolean {
  const field = req.payload.collections?.[rule.collection]?.config?.flattenedFields?.find(
    (candidate) => 'name' in candidate && candidate.name === rule.field,
  )
  return !!field && 'relationTo' in field && Array.isArray(field.relationTo)
}
