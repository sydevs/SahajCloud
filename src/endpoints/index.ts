import type { Endpoint } from 'payload'

import { atlasChallenge } from './atlas/challenge'
import { atlasSeo } from './atlas/seo'
import { atlasSitemap } from './atlas/sitemap'
import { atlasWixRoute } from './atlas/wix/route'
import { atlasWixSitemap } from './atlas/wix/sitemap'

/**
 * The endpoints registered on the config root, for resources that belong to no collection.
 * `payload.config.ts` spreads this into `endpoints`. It lives here, not inline there, so a spec can
 * read what this repo declares without importing the sanitized config, which also carries
 * Payload's and the plugins' own routes (`tests/unit/openapi-endpoint-coverage.spec.ts`).
 */
export const rootEndpoints: Endpoint[] = [
  atlasSeo,
  atlasSitemap,
  atlasChallenge,
  atlasWixRoute,
  atlasWixSitemap,
]
