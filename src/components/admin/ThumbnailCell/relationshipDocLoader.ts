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
) => Promise<RelationshipDoc[]>

/**
 * Default fetcher: one REST request to `/api/{relationTo}` selecting only the
 * thumbnail fields. Mirrors `@payloadcms/ui`'s `requests.get` (cookie auth via
 * `credentials: 'include'`). The selected fields aren't localized, so no locale
 * is sent.
 */
export const fetchRelationshipDocs: FetchRelationshipDocs = async (relationTo, ids) => {
  const query = qs.stringify(
    {
      depth: 0,
      limit: ids.length,
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
 * coalesced into a single request per `relationTo`, collapsing the per-row N+1
 * into one round-trip. See #460.
 */
export function createRelationshipDocLoader(
  fetchDocs: FetchRelationshipDocs = fetchRelationshipDocs,
) {
  // One in-flight batch per related collection, keyed by `relationTo`.
  const batches = new Map<string, PendingBatch>()

  const flush = async (relationTo: string): Promise<void> => {
    const batch = batches.get(relationTo)
    if (!batch) return
    // Detach the batch before awaiting so loads arriving during the fetch open
    // a fresh batch rather than joining one that's already closed.
    batches.delete(relationTo)

    const byId = new Map<string, RelationshipDoc>()
    try {
      const docs = await fetchDocs(relationTo, [...batch.ids])
      for (const doc of docs) byId.set(String(doc.id), doc)
    } catch {
      // Leave `byId` empty — each cell falls back to a placeholder thumbnail.
    }
    batch.resolve(byId)
  }

  /**
   * Resolves the related document for `id`, or `null` if it wasn't returned
   * (missing, trashed, or not readable by the current user).
   */
  const load = (relationTo: string, id: number | string): Promise<RelationshipDoc | null> => {
    let batch = batches.get(relationTo)
    if (!batch) {
      let resolve!: (byId: Map<string, RelationshipDoc>) => void
      const promise = new Promise<Map<string, RelationshipDoc>>((res) => {
        resolve = res
      })
      batch = { ids: new Set(), promise, resolve }
      batches.set(relationTo, batch)
      queueMicrotask(() => {
        void flush(relationTo)
      })
    }

    batch.ids.add(id)
    return batch.promise.then((byId) => byId.get(String(id)) ?? null)
  }

  return { load }
}

/** Shared loader instance used by the thumbnail cells. */
export const relationshipDocLoader = createRelationshipDocLoader()
