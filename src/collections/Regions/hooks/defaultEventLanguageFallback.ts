import type { CollectionAfterReadHook } from 'payload'

/**
 * req.context flag: set while resolving ancestors so their own afterRead
 * returns the raw stored value instead of recursing back into this hook.
 */
const SKIP_FLAG = 'skipRegionLanguageFallback'

/** Extract a numeric region id from a breadcrumb `doc` (id or populated object). */
function breadcrumbDocId(doc: unknown): number | null {
  if (typeof doc === 'number') return doc
  if (typeof doc === 'string') {
    const parsed = Number(doc)
    return Number.isInteger(parsed) ? parsed : null
  }
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
 * doesn't guarantee. Ancestors are resolved in a single bulk query; the
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

  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { id: { in: ancestorIds } },
    depth: 0,
    pagination: false,
    req: { ...req, context: { ...req.context, [SKIP_FLAG]: true } },
  })

  const languageById = new Map<number, string | null | undefined>()
  for (const ancestor of docs) {
    languageById.set(ancestor.id, ancestor.defaultEventLanguage)
  }

  for (const id of ancestorIds) {
    const inherited = languageById.get(id)
    if (inherited) {
      region.defaultEventLanguage = inherited
      break
    }
  }

  return doc
}
