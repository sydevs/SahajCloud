import type { CollectionAfterReadHook, PayloadRequest } from 'payload'

/**
 * req.context flag: set while resolving ancestors so their own afterRead
 * returns the raw stored value instead of recursing back into this hook.
 */
const SKIP_FLAG = 'skipRegionLanguageFallback'

/**
 * req.context key for the per-request memo of raw ancestor
 * `defaultEventLanguage` values, keyed by region id. Every row of a list read
 * shares one `req` (and thus one context), so resolving a shared ancestor once
 * serves every descendant in that request instead of re-querying per row.
 */
const LANGUAGE_MEMO = 'regionLanguageMemo'

/** Get (or lazily create) the per-request ancestor-language memo. */
function languageMemo(req: PayloadRequest): Map<number, string | null> {
  const ctx = req.context as Record<string, unknown>
  let memo = ctx[LANGUAGE_MEMO] as Map<number, string | null> | undefined
  if (!memo) {
    memo = new Map()
    ctx[LANGUAGE_MEMO] = memo
  }
  return memo
}

/** Extract a numeric region id from a breadcrumb `doc` (a bare id, or a populated object). */
function breadcrumbDocId(doc: unknown): number | null {
  if (typeof doc === 'number') return doc
  if (doc && typeof doc === 'object' && 'id' in doc) {
    const id = (doc as { id: unknown }).id
    return typeof id === 'number' ? id : null
  }
  return null
}

/**
 * Collection afterRead hook: fills a Region's empty `defaultEventLanguage` by
 * inheriting the nearest ancestor's value, walking up the nested-docs
 * breadcrumbs chain (Country → Region → Area → Center). Editing a country's
 * language therefore cascades live to every descendant that hasn't set its
 * own — no stored denormalization, computed on read.
 *
 * This runs at the collection level (not as a field hook) because it needs the
 * fully-assembled `breadcrumbs` array, which sibling field-hook traversal
 * doesn't guarantee. Ancestors are resolved in a bulk query, memoized per
 * request (see `LANGUAGE_MEMO`) so a list read shares lookups across rows; the
 * `SKIP_FLAG` on the cloned req stops those reads from recursing into this
 * hook, so each resolves to its own raw value and the nearest non-empty wins.
 */
export const defaultEventLanguageFallback: CollectionAfterReadHook = async ({ doc, req }) => {
  const region = doc as Record<string, unknown>
  // An explicit value always wins.
  if (region.defaultEventLanguage) return doc
  // We're resolving an ancestor for another node — leave it raw.
  if (req?.context?.[SKIP_FLAG]) return doc

  const breadcrumbs = Array.isArray(region.breadcrumbs)
    ? (region.breadcrumbs as Array<{ doc?: unknown }>)
    : []
  // Breadcrumbs are ordered root → self; drop self (last entry) and walk
  // nearest-ancestor first.
  const ancestorIds = breadcrumbs
    .slice(0, -1)
    .map((crumb) => breadcrumbDocId(crumb?.doc))
    .filter((id): id is number => id !== null)
    .reverse()

  if (ancestorIds.length === 0) return doc

  // Resolve only the ancestors not already memoized by an earlier row in this
  // request; record null for any id the query didn't return (deleted /
  // inaccessible) so it isn't re-queried.
  const memo = languageMemo(req)
  const missing = ancestorIds.filter((id) => !memo.has(id))
  if (missing.length > 0) {
    const { docs } = await req.payload.find({
      collection: 'regions',
      where: { id: { in: missing } },
      depth: 0,
      pagination: false,
      req: { ...req, context: { ...req.context, [SKIP_FLAG]: true } },
    })
    for (const ancestor of docs) {
      memo.set(ancestor.id, ancestor.defaultEventLanguage ?? null)
    }
    for (const id of missing) {
      if (!memo.has(id)) memo.set(id, null)
    }
  }

  for (const id of ancestorIds) {
    const inherited = memo.get(id)
    if (inherited) {
      region.defaultEventLanguage = inherited
      break
    }
  }

  return doc
}
