import type { EmbedRouting } from './embedMetadata'

import { isRecord } from '@/lib/utilities/isRecord'

import { EMBED_ROUTING } from './embedMetadata'
import { isCanonicalDomain } from './hooks/validateCanonicalOwnership'

/**
 * Derive a **starting point** for `canonical` from an imported Atlas client's
 * raw legacy record (#633).
 *
 * Read from `legacyData.config` rather than the old `legacyConfig` field, which
 * this ticket removed: `legacyData` holds the source record verbatim, so the
 * same values survive the drop and the backfill can run at any time — not only
 * in the window before the migration applies.
 *
 * **Never derives `enabled`.** The legacy values are unverified and demonstrably
 * wrong in places (`sahajayoga.at` records `embed_type: 'script'` while serving
 * an iframe), so a human confirms them against reported embeds before anything
 * resolves differently. This only saves that person retyping a domain.
 */
export interface CanonicalSeed {
  domain?: string
  routing?: EmbedRouting
}

/**
 * Returns what can be salvaged from `legacyData`, or `null` when nothing can.
 *
 * Each field is judged on its own — a record with an unusable domain but a
 * legible `routing_type` still yields the routing. Values that don't survive:
 *
 * - a domain holding more than one host (two records do), or any other shape the
 *   admin panel's own validator would reject;
 * - a `routing_type` outside the new two-value enum. The current data holds only
 *   `query` and `path`, but the legacy system also had `hash`, and hash routing
 *   is exactly what the widget is dropping.
 */
export function canonicalSeedFromLegacy(legacyData: unknown): CanonicalSeed | null {
  if (!isRecord(legacyData)) return null
  const config = legacyData.config
  if (!isRecord(config)) return null

  const seed: CanonicalSeed = {}

  const domain = typeof config.domain === 'string' ? config.domain.trim().toLowerCase() : ''
  if (isCanonicalDomain(domain)) seed.domain = domain

  const routing = config.routing_type
  if (typeof routing === 'string' && (EMBED_ROUTING as readonly string[]).includes(routing)) {
    seed.routing = routing as EmbedRouting
  }

  return seed.domain === undefined && seed.routing === undefined ? null : seed
}
