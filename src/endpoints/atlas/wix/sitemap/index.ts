import type { Endpoint } from 'payload'

import { z } from 'zod'

import { WIX_PREFIX_MAX_LENGTH, WIX_PREFIX_PATTERN } from '@/lib/atlas/wixPrefix'
import { primaryPageUrl } from '@/lib/clients/site'
import {
  parseQuery,
  readFailureResponse,
  requireClientAccess,
  requireIntegerClientId,
} from '@/lib/endpoints'
import type { Client } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { countClientRead } from '@/plugins/usage'

import { resolveAtlasSitemap } from '../../sitemap/resolve'
import { type AtlasWixSitemapEntry, hostOf, wixSitemapEntries } from '../shape'

const querySchema = z.object({
  // The Install tab's own rule, so a prefix it accepts cannot be refused here.
  prefix: z.string().min(1).max(WIX_PREFIX_MAX_LENGTH).regex(WIX_PREFIX_PATTERN, {
    message: 'A router prefix is one lowercase path segment, e.g. free-classes.',
  }),
})

/**
 * GET /api/atlas/wix/sitemap?prefix=free-classes
 *
 * Every atlas page this client owns, as Velo `*_SiteMap` entries (#1055) — the
 * resolution `GET /api/atlas/sitemap` answers from, so a Wix sitemap and its
 * pages' canonicals cannot name different URLs.
 *
 * - **An array, not an envelope**, returned verbatim by the generated function.
 *   No `generated` timestamp: Wix caches whole responses, and it is the one
 *   field that moves between two identical answers.
 * - A client that has designated no canonical embed has no host, and gets
 *   `[]` — an answer, not an error.
 *
 * A root endpoint, so the gates are called by hand (`docs/rules/endpoints.md`).
 */
export const atlasWixSitemap: Endpoint = {
  path: '/atlas/wix/sitemap',
  method: 'get',
  handler: async (req) => {
    const denied = requireClientAccess(req)
    if (denied) return denied

    const parsed = parseQuery(req, querySchema)
    if (!parsed.ok) return parsed.response

    const caller = requireIntegerClientId(req, 'Failed to build the sitemap for this client.')
    if (!caller.ok) return caller.response
    const { clientId } = caller

    await countClientRead(req)

    try {
      const body: AtlasWixSitemapEntry[] = wixSitemapEntries({
        resolution: await resolveAtlasSitemap({ req, clientId }),
        prefix: parsed.data.prefix,
        host: hostOf(primaryPageUrl((req.user as Client | undefined)?.site)),
      })
      return Response.json(body, { headers: publicReadCacheHeaders(req, ['events', 'regions']) })
    } catch (error) {
      return readFailureResponse(req, error, 'Failed to build the sitemap for this client.', {
        msg: 'atlasWixSitemap: read failed',
        clientId,
      })
    }
  },
}
