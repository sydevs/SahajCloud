import type { PayloadRequest } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

import { buildCacheHeaders, resolveTtl } from './policy'

/**
 * In-handler response decorator for a **custom** public client endpoint (the
 * `for-audience` / `for-user` / `related-*` / `songs` / `geojson` reads).
 *
 * Pass the collection slugs the response is built from: they become the
 * `Cache-Tag`, and their lowest per-collection TTL becomes the `s-maxage` (via
 * {@link resolveTtl}), so the response never outlives its freshest input. A valid
 * live-preview request serves drafts, so it gets `private, no-store`. Built-in
 * REST collection reads are handled by the middleware instead (`./middleware`);
 * both go through {@link buildCacheHeaders}, so the two surfaces stay byte-identical.
 *
 *   headers: publicReadCacheHeaders(req, ['songs', 'meditations'])
 */
export function publicReadCacheHeaders(
  req: PayloadRequest,
  tags: readonly string[],
): Record<string, string> {
  return buildCacheHeaders({
    sMaxAge: resolveTtl(tags),
    tags,
    preview: hasValidPreviewSecret(req),
  })
}
