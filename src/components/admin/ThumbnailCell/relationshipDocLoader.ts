import * as qs from 'qs-esm'

/**
 * A related document resolved for a thumbnail cell. Only the fields a thumbnail
 * needs are selected — the related collection (e.g. `images`) carries far more.
 */
export interface RelationshipDoc {
  id: number | string
  url?: string
  mimeType?: string
  filename?: string
}

/**
 * Fetches a batch of related documents by ID from a single collection.
 * Injected into the loader so tests can supply a fake.
 */
export type FetchRelationshipDocs = (
  relationTo: string,
  ids: Array<number | string>,
  locale: string,
) => Promise<RelationshipDoc[]>

/**
 * Default fetcher: one REST request to `/api/{relationTo}` selecting only the
 * thumbnail fields. Mirrors `@payloadcms/ui`'s `requests.get` (cookie auth via
 * `credentials: 'include'`).
 *
 * The locale is required even though none of the selected fields is localized.
 * The collection's read gate resolves the manager's roles at `req.locale`, and
 * a request naming no locale resolves to the default one — so a manager whose
 * roles live only in another locale got a 403 and a page of placeholder
 * thumbnails (#701).
 */
export const fetchRelationshipDocs: FetchRelationshipDocs = async (relationTo, ids, locale) => {
  const query = qs.stringify(
    {
      depth: 0,
      limit: ids.length,
      locale,
      select: { filename: true, mimeType: true, url: true },
      where: { id: { in: ids } },
    },
    { addQueryPrefix: true },
  )

  const response = await fetch(`/api/${relationTo}${query}`, { credentials: 'include' })
  if (response.status > 201) return []

  const json = (await response.json()) as { docs?: RelationshipDoc[] }
  return json.docs ?? []
}

interface PendingBatch {
  ids: Set<number | string>
  promise: Promise<Map<string, RelationshipDoc>>
  resolve: (byId: Map<string, RelationshipDoc>) => void
}

/**
 * Creates a request-batching loader for upload/relationship documents.
 *
 * Every `load()` call made within the same microtask tick — i.e. all the
 * thumbnail cells on a list page, whose effects React flushes together — is
 * coalesced into a single request per `relationTo` and locale, collapsing the
 * per-row N+1 into one round-trip. See #460, and the locale note on `batches`.
 */
export function createRelationshipDocLoader(
  fetchDocs: FetchRelationshipDocs = fetchRelationshipDocs,
) {
  // One in-flight batch per related collection AND locale. Two locales must
  // not share a batch: the response is gated per locale, so merging them
  // would answer one locale's cells from the other's request.
  const batches = new Map<string, PendingBatch>()

  const batchKey = (relationTo: string, locale: string): string => `${relationTo}:${locale}`

  const flush = async (relationTo: string, locale: string): Promise<void> => {
    const key = batchKey(relationTo, locale)
    const batch = batches.get(key)
    if (!batch) return
    // Detach the batch before awaiting so loads arriving during the fetch open
    // a fresh batch rather than joining one that's already closed.
    batches.delete(key)

    const byId = new Map<string, RelationshipDoc>()
    try {
      const docs = await fetchDocs(relationTo, [...batch.ids], locale)
      for (const doc of docs) byId.set(String(doc.id), doc)
    } catch {
      // Leave `byId` empty — each cell falls back to a placeholder thumbnail.
    }
    batch.resolve(byId)
  }

  /**
   * Resolves the related document for `id`, or `null` if it wasn't returned
   * (missing, trashed, or not readable by the current user in `locale`).
   */
  const load = (
    relationTo: string,
    id: number | string,
    locale: string,
  ): Promise<RelationshipDoc | null> => {
    const key = batchKey(relationTo, locale)
    let batch = batches.get(key)
    if (!batch) {
      let resolve!: (byId: Map<string, RelationshipDoc>) => void
      const promise = new Promise<Map<string, RelationshipDoc>>((res) => {
        resolve = res
      })
      batch = { ids: new Set(), promise, resolve }
      batches.set(key, batch)
      queueMicrotask(() => {
        void flush(relationTo, locale)
      })
    }

    batch.ids.add(id)
    return batch.promise.then((byId) => byId.get(String(id)) ?? null)
  }

  return { load }
}

/** Shared loader instance used by the thumbnail cells. */
export const relationshipDocLoader = createRelationshipDocLoader()
