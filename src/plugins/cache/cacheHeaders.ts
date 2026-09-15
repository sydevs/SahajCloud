import type { PayloadRequest } from 'payload'

import { PREVIEW_SECRET_HEADER } from '@/lib/utilities/previewSecret'

import { buildCacheHeaders, isDraftRead, resolveTtl, type CacheableSlug } from './policy'

/**
 * In-handler response decorator for a **custom** public client endpoint (the
 * `for-audience` / `for-user` / `related-*` / `songs` / `geojson` reads).
 *
 * Pass the collection slugs the response is built from: they become the
 * `Cache-Tag`, and their lowest per-collection TTL becomes the `s-maxage` (via
 * {@link resolveTtl}), so the response never outlives its freshest input. A valid
 * request carrying a live-preview header serves drafts, so it gets
 * `private, no-store` — as does any read asking for drafts. Built-in REST collection reads are
 * handled by the middleware instead (`./middleware`); both go through
 * {@link buildCacheHeaders}, so the two surfaces stay byte-identical.
 *
 *   headers: publicReadCacheHeaders(req, ['songs', 'meditations'])
 */
export function publicReadCacheHeaders(
  req: PayloadRequest,
  tags: readonly CacheableSlug[],
): Record<string, string> {
  return buildCacheHeaders({
    sMaxAge: resolveTtl(tags),
    tags,
    // ⚠ **Header PRESENCE, not validity — deliberately weaker than the access
    // layer's check, and deliberately safer.**
    //
    // The validated verdict is stamped on `req.context` by
    // `resolveLivePreviewHook`. Every endpoint below reads through
    // `asTrustedReq`, which CLONES the context (`{ ...req.context }`) so its
    // `SKIP_VALIDATION` flag cannot leak back — so the stamp lands on the clone
    // and this `req` never sees it. Asking for validity here returned `false`
    // for every preview read on these five routes, and stamped a draft-bearing
    // response `public, s-maxage=…` with `Vary: Authorization`.
    //
    // Presence cannot miss that way. The cost is that a request carrying a
    // bogus header gets `no-store` it did not earn, which is a slightly colder
    // cache and never a leak. The access layer still decides what is actually
    // returned.
    preview: Boolean(req.headers?.get?.(PREVIEW_SECRET_HEADER)),
    // `req.url` is path + query on a Payload request, so it needs a base to
    // parse. The base is discarded; only the search params are read.
    draft: isDraftRead(new URL(req.url ?? '', 'http://localhost').searchParams),
  })
}
