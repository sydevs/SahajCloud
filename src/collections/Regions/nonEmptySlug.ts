import type { TextField } from 'payload'

/** Blank, or not a usable string at all. */
function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

const MESSAGE =
  'A region needs a slug — it is one segment of every canonical URL beneath it. Give the region a name, or set the slug directly.'

/**
 * Refuse a **newly** blank region slug (#634).
 *
 * A region's slug is a path segment, so a blank one is not merely untidy — it
 * makes the whole subtree's canonical URLs unbuildable. `buildRegionPath`
 * refuses a chain with a gap in it, so a region with no slug, every descendant
 * beneath it, and every event inside those all silently lose `webPath` and
 * `webUrl`.
 *
 * The hole this closes is in the slug field's own validator: `slugField`
 * installs a uniqueness `validate`, and supplying one **replaces** Payload's
 * default that enforces `required` — and that validator opens with
 * `if (!value) return true`. So an empty slug passes field validation entirely
 * today. (Same trap as the Events `title` case in
 * `.claude/rules/collections.md`.)
 *
 * ## Why this is a validator and not a hook
 *
 * Payload generates the slug from `name` in a **field `beforeChange`** hook, and
 * the collection hooks all run before that: field beforeValidate → collection
 * beforeValidate → collection beforeChange → field beforeChange. A collection
 * hook therefore sees an empty slug on every auto-generating create and rejects
 * writes that are perfectly fine. Field `validate` runs after the generator, so
 * it is the only place that sees the value that will actually be stored.
 *
 * ## Why it grandfathers rather than rejects outright
 *
 * 16 regions have a blank name (and therefore a blank slug) in the data today,
 * and this ticket deliberately does not rewrite that data. Rejecting *every*
 * write carrying a blank slug would not just block edits to those 16 — it would
 * block edits to their **ancestors**, because the nested-docs `resaveChildren`
 * cascade re-saves each descendant by passing its whole existing document back
 * through `update`, blank slug included. One bad row would make an entire
 * country unsaveable.
 *
 * So the invariant is on the *transition*, not the state: introducing a blank
 * slug fails loudly (a create, or clearing one that had a value), while a blank
 * that was already there passes through untouched. Find the existing ones with
 * `pnpm tsx scripts/audit-region-slugs.ts`; once they are fixed there is no
 * grandfathered case left to hit.
 */
/**
 * The slice of Payload's validator signature this wrapper needs. Spelled out
 * and cast at the boundary — the same shape `slugField` itself uses for the
 * uniqueness validator it installs, because `TextField['validate']` is a
 * generic union whose parameters aren't contextually typed.
 */
type SlugValidator = (
  value: string | null | undefined,
  options: { operation?: string; previousValue?: unknown },
) => string | true | Promise<string | true>

export function withNonEmptySlug(inner: TextField['validate']): TextField['validate'] {
  const validate: SlugValidator = (value, options) => {
    if (isBlank(value)) {
      // Nothing existed before, so this write is what makes it blank.
      if (options.operation === 'create') return MESSAGE
      // It had a real slug and this write is clearing it.
      if (!isBlank(options.previousValue)) return MESSAGE
      // Already blank before this write — a pre-existing row being re-saved,
      // very often by the breadcrumb cascade rather than by a person.
      return true
    }
    return inner ? (inner as unknown as SlugValidator)(value, options) : true
  }
  return validate as TextField['validate']
}
