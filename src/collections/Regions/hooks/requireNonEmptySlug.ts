import type { CollectionBeforeValidateHook } from 'payload'

import { ValidationError } from 'payload'

/** Blank, or not a usable string at all. */
function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

/**
 * A region's slug is a **path segment**, so a blank one is not merely untidy —
 * it makes the whole subtree's canonical URLs unbuildable. `buildRegionPath`
 * refuses a chain with a gap in it, so a region with no slug, every descendant
 * beneath it, and every event inside those all silently lose `webPath` and
 * `webUrl` (#634).
 *
 * The hole this closes is in the slug field's own validator: `slugField` sets a
 * uniqueness `validate`, and supplying one **replaces** Payload's default that
 * enforces `required` — and that validator opens with `if (!value) return true`.
 * So an empty slug passes field validation entirely today. (Same trap as the
 * Events `title` case in `.claude/rules/collections.md`.)
 *
 * Runs as a collection `beforeValidate`, which is after the *field*-level
 * beforeValidate that auto-generates the slug from `name` — so this sees the
 * final value, including one the create hook just filled in.
 *
 * ## Why it grandfathers rather than rejects outright
 *
 * 16 regions have a blank name (and therefore a blank slug) in the data today,
 * and this ticket deliberately does not rewrite that data. Rejecting *every*
 * write that carries a blank slug would not just block edits to those 16 — it
 * would block edits to their **ancestors**, because the nested-docs
 * `resaveChildren` cascade re-saves each descendant by passing its whole
 * existing document back through `update`, blank slug included. One bad row
 * would make an entire country unsaveable.
 *
 * So the invariant is on the *transition*, not the state: introducing a blank
 * slug fails loudly (a create, or clearing a slug that had a value), while a
 * blank one that was already there passes through untouched. Find the existing
 * ones with `pnpm tsx scripts/audit-region-slugs.ts`; once they are fixed there
 * is no grandfathered case left to hit.
 */
export const requireNonEmptySlug: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data
  // On update, `data` is the incoming patch — a patch that doesn't mention the
  // slug isn't claiming anything about it, so there is nothing to check.
  if (operation !== 'create' && !('slug' in data)) return data
  if (!isBlank(data.slug)) return data

  // Already blank before this write: a pre-existing row being re-saved (very
  // often by the breadcrumb cascade, not by a person). Let it through.
  if (operation !== 'create' && isBlank(originalDoc?.slug)) return data

  throw new ValidationError(
    {
      errors: [
        {
          message:
            'A region needs a slug — it is one segment of every canonical URL beneath it. Give the region a name, or set the slug directly.',
          path: 'slug',
        },
      ],
    },
    req.t,
  )
}
