/**
 * Build Payload's standard paginated list envelope for an **empty** result at
 * the given `limit`, matching the built-in REST list shape (`docs` + pagination
 * metadata). Reused by endpoints that short-circuit to "no results" without
 * issuing a query (e.g. a meditation with no `songTag`), and by future
 * `select`-style endpoints.
 *
 * The caller wraps it: `return Response.json(emptyPaginatedResponse<SongResult>(limit))`.
 */
export function emptyPaginatedResponse<T = never>(limit: number) {
  return {
    docs: [] as T[],
    totalDocs: 0,
    limit,
    totalPages: 0,
    page: 1,
    pagingCounter: 0,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
  }
}
