import type { AtlasWixSitemapEntry } from '../../../responseTypes'
import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { WIX_PREFIX_MAX_LENGTH, WIX_PREFIX_PATTERN } from '@/lib/atlas/wixPrefix'
import { splitMountKey } from '@/lib/clients/verification'
import {
  errorResponse,
  parseQuery,
  requireActiveClient,
  requireIntegerClientId,
} from '@/lib/endpoints'
import type { Client } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed, countClientRead } from '@/plugins/usage'

import { resolveAtlasSitemap } from '../../sitemap/resolve'
import { wixSitemapEntries } from '../wixSitemap'

const querySchema = z.object({
  // The one prefix rule, shared with the Install tab that validates the
  // volunteer's choice — so a prefix the tab accepts cannot be refused here.
  prefix: z.string().min(1).max(WIX_PREFIX_MAX_LENGTH).regex(WIX_PREFIX_PATTERN, {
    message: 'A router prefix is one lowercase path segment, e.g. free-classes.',
  }),
})

/**
 * GET /api/atlas/wix/sitemap?prefix=free-classes
 *
 * Every atlas page this client owns, as the relative entries a Velo
 * `*_SiteMap` function returns (#1055). A serializer over
 * `resolveAtlasSitemap` — the same ownership resolution `GET
 * /api/atlas/sitemap` answers from, so a Wix site's sitemap and its pages'
 * canonicals cannot name different URLs.
 *
 * **Contract notes the generated `routers.js` depends on:**
 *
 * - **An array, not an envelope.** Wix's `router_SiteMap` returns a list, and
 *   the generated function returns this body verbatim rather than reaching into
 *   it. `/api/atlas/sitemap`'s `generated` timestamp is deliberately absent:
 *   it is the one field that moves between two identical answers, and Wix
 *   caches whole responses.
 * - **Every `url` is relative and carries `prefix`.** See
 *   {@link wixSitemapEntries} for why this differs from `redirect` on the route
 *   endpoint.
 * - **Only pages on this client's own host.** A client that has designated no
 *   canonical embed yet has no host, and gets `[]` — which is an answer, not an
 *   error: it owns pages it is not yet publishing.
 * - **Finished classes are excluded**, and a document whose canonical cannot be
 *   published is omitted rather than sent empty, exactly as on
 *   `/api/atlas/sitemap`.
 *
 * Registered at the config root because the answer spans regions *and* events,
 * so the gates are called by hand (see `docs/rules/endpoints.md`).
 *
 * Returns `AtlasWixSitemapEntry[]` (see ../../responseTypes).
 */
export const atlasWixSitemap: Endpoint = {
  path: '/atlas/wix/sitemap',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    try {
      assertClientOriginAllowed(req)
    } catch (error) {
      if (error instanceof APIError) return errorResponse(error.message, error.status)
      throw error
    }

    const parsed = parseQuery(req, querySchema)
    if (!parsed.ok) return parsed.response

    const caller = requireIntegerClientId(req, 'Failed to build the sitemap for this client.')
    if (!caller.ok) return caller.response
    const { clientId } = caller

    await countClientRead(req)

    try {
      const embed = (req.user as Client | undefined)?.canonical?.embed
      const body: AtlasWixSitemapEntry[] = wixSitemapEntries({
        resolution: await resolveAtlasSitemap({ req, clientId }),
        prefix: parsed.data.prefix,
        host: embed ? (splitMountKey(embed)?.domain ?? null) : null,
      })
      return Response.json(body, { headers: publicReadCacheHeaders(req, ['events', 'regions']) })
    } catch (error) {
      if (error instanceof APIError) return errorResponse(error.message, error.status)
      req.payload.logger.error({
        msg: 'atlasWixSitemap: read failed',
        clientId,
        error: error instanceof Error ? error.message : String(error),
      })
      return errorResponse('Failed to build the sitemap for this client.', 500)
    }
  },
}
