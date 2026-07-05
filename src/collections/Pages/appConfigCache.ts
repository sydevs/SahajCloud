import type { PayloadRequest } from 'payload'

/** Where the in-flight `wm-app-config` load is stashed on `req.context`. */
const CACHE_KEY = 'appUrlWmConfig'

/**
 * Load the `wm-app-config` global at most once per request, shared across the
 * many `appUrl` afterRead hooks a single request fans out (one per page).
 *
 * Why memoize the in-flight *promise* rather than the resolved value: a bulk
 * publish runs every doc's afterRead concurrently — Payload's bulk update awaits
 * them with `Promise.all` because `bulkOperationsSingleTransaction` defaults to
 * false. A resolved-value cache stampedes under that concurrency: all N hooks
 * clear the "not cached yet" check before the first load settles, so each issues
 * its own `findGlobal` — the per-doc reload #542/#534 measured in production
 * (10× for a 10-page publish). The stampede only surfaces when the load is slow
 * (prod saw ~900 ms of connection-pool wait per query), so it hides on a fast
 * local DB — hence the deterministic unit test rather than a timing-dependent one.
 *
 * Storing the promise synchronously (no await between the check and the store)
 * means every later caller in the request awaits the same one, collapsing the
 * load to exactly one. Also dedupes parallel relationship/list reads.
 *
 * A sibling value-cache (`getWmAppConfig`, keyed by `locale:depth`) loads the
 * same global for the app-status global reads; folding both behind one shared
 * single-flight loader in `src/lib/` is a reasonable follow-up, out of scope here.
 */
export function loadAppConfigOnce(req: PayloadRequest): Promise<Record<string, unknown>> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  let configPromise = ctx[CACHE_KEY] as Promise<Record<string, unknown>> | undefined
  if (!configPromise) {
    configPromise = req.payload.findGlobal({
      slug: 'wm-app-config',
      depth: 0,
      req,
    }) as unknown as Promise<Record<string, unknown>>
    ctx[CACHE_KEY] = configPromise
    req.context = ctx
  }
  return configPromise
}
