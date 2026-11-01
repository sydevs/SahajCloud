import type { AtlasWixSitemapEntry } from '../../../responseTypes'
import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { splitMountKey } from '@/lib/clients/verification'
import { parseQuery, requireActiveClient } from '@/lib/endpoints'
import type { Client } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed, countClientRead } from '@/plugins/usage'

import { resolveAtlasSitemap } from '../../sitemap/resolve'
import { wixSitemapEntries } from '../wixSitemap'

/**
 * A Wix router prefix: the dynamic page's own slug, one path segment.
 *
 * Bounded and `[a-z0-9-]` because it is spliced into every entry's `url`, and
 * because that is the set Wix itself accepts for a dynamic page slug — the
 * Install tab validates the operator's choice against the same rule.
 */
const PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const querySchema = z.object({
  prefix: z.string().min(1).max(64).regex(PREFIX_PATTERN, {
    message: 'A router prefix is one lowercase path segment, e.g. free-classes.',
  }),
})

/** The standard error envelope, so every refusal here reads the same. */
function errorResponse(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
}

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

    // The same refusal `GET /api/atlas/sitemap` makes, and for the same reason:
    // a non-integer id matches no owner, and "you own nothing" is
    // indistinguishable from the legitimate empty answer. A consumer told it
    // owns nothing publishes an empty sitemap, which is how a site asks to be
    // de-indexed.
    const clientId = Number(req.user?.id)
    if (!Number.isInteger(clientId)) {
      req.payload.logger.error({
        msg: 'atlasWixSitemap: client id is not an integer',
        clientId: req.user?.id,
      })
      return errorResponse('Failed to build the sitemap for this client.', 500)
    }

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
