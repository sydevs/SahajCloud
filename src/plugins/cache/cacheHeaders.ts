import type { PayloadRequest } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

import { buildCacheHeaders, type PublicReadCacheOptions } from './policy'

/**
 * In-handler response decorator for a **custom** public client endpoint (the
 * `for-audience` / `for-user` / `related-*` / `songs` / `geojson` reads).
 *
 * Thin `PayloadRequest` adapter over {@link buildCacheHeaders}: it resolves the
 * preview branch from the request (a valid live-preview request serves drafts,
 * so it gets `private, no-store`) and otherwise emits the shared `public` +
 * `Vary: Authorization` (+ `Cache-Tag`) headers. Built-in REST collection reads
 * are handled by the middleware instead (`./middleware`); both go through
 * `buildCacheHeaders`, so the two surfaces stay byte-identical.
 *
 * Call it with the endpoint's policy from `CUSTOM_READS` (see `./policy`):
 * `headers: publicReadCacheHeaders(req, CUSTOM_READS.audiencesForUser)`.
 */
export function publicReadCacheHeaders(
  req: PayloadRequest,
  opts: PublicReadCacheOptions,
): Record<string, string> {
  return buildCacheHeaders({ ...opts, preview: hasValidPreviewSecret(req) })
}
