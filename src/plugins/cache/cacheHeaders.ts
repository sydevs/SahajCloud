import type { PayloadRequest } from 'payload'

import { PREVIEW_SECRET_HEADER } from '@/lib/utilities/previewSecret'

import { buildCacheHeaders, isDraftRead, resolveTtl, type CacheableSlug } from './policy'

/**
 * In-handler response decorator for a **custom** public client endpoint (the
 * `for-audience` / `for-user` / `related-*` / `songs` / `geojson` reads).
 *
 * Pass the collection slugs the response is built from: they become the
 * `Cache-Tag`, and their lowest per-collection TTL becomes the `s-maxage` (via
 * {@link resolveTtl}), so the response never outlives its freshest input. A
 * live-preview or draft read gets `private, no-store` instead. Built-in REST
 * collection reads are handled by the middleware (`./middleware`); both go
 * through {@link buildCacheHeaders}, so the two surfaces stay byte-identical.
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
    // ⚠ **Header presence, not the validated verdict.** These endpoints read
    // through `asTrustedReq`, which CLONES `req.context`, so the stamp
    // `resolveLivePreviewHook` leaves lands on the clone and this `req` never
    // sees it — asking for validity here marked draft-bearing responses
    // `public, s-maxage=…`. A bogus header now costs an unearned `no-store`,
    // which is a colder cache and never a leak.
    preview: Boolean(req.headers?.get?.(PREVIEW_SECRET_HEADER)),
    // `req.url` is path + query on a Payload request, so parsing it needs a
    // base. The base is discarded.
    draft: isDraftRead(new URL(req.url ?? '', 'http://localhost').searchParams),
  })
}
