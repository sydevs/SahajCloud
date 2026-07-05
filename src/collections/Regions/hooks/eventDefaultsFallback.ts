import type { CollectionAfterReadHook, PayloadRequest } from 'payload'

/**
 * req.context flag: set while resolving ancestors so their own afterRead
 * returns the raw stored values instead of recursing back into this hook.
 */
const SKIP_FLAG = 'skipRegionEventDefaultsFallback'

/**
 * req.context key for the per-request memo of raw ancestor `eventDefaults`,
 * keyed by region id. Every row of a list read shares one `req` (and thus one
 * context), so resolving a shared ancestor once serves every descendant in that
 * request instead of re-querying per row.
 */
const MEMO = 'regionEventDefaultsMemo'

type RegionEventDefaults = { language?: string | null; timeZone?: string[] | null }

/** The inheritable event-default values pulled from an ancestor region. */
interface AncestorDefaults {
  language: string | null
  timeZone: string[] | null
}

/** Get (or lazily create) the per-request ancestor-defaults memo. */
function defaultsMemo(req: PayloadRequest): Map<number, AncestorDefaults> {
  const ctx = req.context as Record<string, unknown>
  let memo = ctx[MEMO] as Map<number, AncestorDefaults> | undefined
  if (!memo) {
    memo = new Map()
    ctx[MEMO] = memo
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

/** Read an ancestor's inheritable defaults, normalizing an empty timeZone array to null. */
function readDefaults(eventDefaults: RegionEventDefaults | null | undefined): AncestorDefaults {
  const timeZone = eventDefaults?.timeZone
  return {
    language: eventDefaults?.language ?? null,
    timeZone: Array.isArray(timeZone) && timeZone.length > 0 ? timeZone : null,
  }
}

/**
 * Collection afterRead hook: fills a Region's empty `eventDefaults.language`
 * and `eventDefaults.timeZone` by inheriting the nearest ancestor that sets
 * each, walking up the nested-docs breadcrumbs chain (Country → Region → Area →
 * Center). The two fields inherit independently — each takes the nearest
 * ancestor that has it. Editing a country's defaults therefore cascades live to
 * every descendant that hasn't set its own — no stored denormalization,
 * computed on read.
 *
 * This runs at the collection level (not as a field hook) because it needs the
 * fully-assembled `breadcrumbs` array, which sibling field-hook traversal
 * doesn't guarantee. Ancestors are resolved in a bulk query, memoized per
 * request (see `MEMO`) so a list read shares lookups across rows; the
 * `SKIP_FLAG` on the cloned req stops those reads from recursing into this
 * hook, so each resolves to its own raw values and the nearest non-empty wins.
 */
export const eventDefaultsFallback: CollectionAfterReadHook = async ({ doc, req }) => {
  const region = doc as {
    breadcrumbs?: Array<{ doc?: unknown }>
    eventDefaults?: RegionEventDefaults | null
  }
  const current = readDefaults(region.eventDefaults)
  const needsLanguage = !current.language
  const needsTimeZone = !current.timeZone
  // Both already set — nothing to inherit.
  if (!needsLanguage && !needsTimeZone) return doc
  // We're resolving an ancestor for another node — leave it raw.
  if (req?.context?.[SKIP_FLAG]) return doc

  const breadcrumbs = Array.isArray(region.breadcrumbs) ? region.breadcrumbs : []
  // Breadcrumbs are ordered root → self; drop self (last entry) and walk
  // nearest-ancestor first.
  const ancestorIds = breadcrumbs
    .slice(0, -1)
    .map((crumb) => breadcrumbDocId(crumb?.doc))
    .filter((id): id is number => id !== null)
    .reverse()

  if (ancestorIds.length === 0) return doc

  // Resolve only the ancestors not already memoized by an earlier row in this
  // request; record empty defaults for any id the query didn't return.
  const memo = defaultsMemo(req)
  const missing = ancestorIds.filter((id) => !memo.has(id))
  if (missing.length > 0) {
    // NB: spreading `req.context` here also propagates the region web-path
    // resolver's re-entrancy flag (see RESOLVING_FLAG in
    // `src/lib/atlas/regionWebPaths.ts`) into this nested read — that's what
    // stops it re-scanning the whole tree per ancestor. Keep the spread.
    const { docs } = await req.payload.find({
      collection: 'regions',
      where: { id: { in: missing } },
      depth: 0,
      pagination: false,
      req: { ...req, context: { ...req.context, [SKIP_FLAG]: true } },
    })
    for (const ancestor of docs) {
      memo.set(
        ancestor.id,
        readDefaults((ancestor as { eventDefaults?: RegionEventDefaults }).eventDefaults),
      )
    }
    for (const id of missing) {
      if (!memo.has(id)) memo.set(id, { language: null, timeZone: null })
    }
  }

  // Each field inherits independently from its nearest ancestor that sets it.
  let language: string | null = null
  let timeZone: string[] | null = null
  for (const id of ancestorIds) {
    const ancestor = memo.get(id)
    if (!ancestor) continue
    if (language === null) language = ancestor.language
    if (timeZone === null) timeZone = ancestor.timeZone
    if (language !== null && timeZone !== null) break
  }

  if ((needsLanguage && language) || (needsTimeZone && timeZone)) {
    const eventDefaults: RegionEventDefaults = region.eventDefaults ?? (region.eventDefaults = {})
    if (needsLanguage && language) eventDefaults.language = language
    if (needsTimeZone && timeZone) eventDefaults.timeZone = timeZone
  }

  return doc
}
