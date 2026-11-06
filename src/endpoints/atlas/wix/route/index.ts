import type { Endpoint } from 'payload'

import { z } from 'zod'

import { primaryPageUrl } from '@/lib/clients/site'
import { parseQuery, readFailureResponse, requireClientAccess } from '@/lib/endpoints'
import { baseLanguage, DEFAULT_LOCALE } from '@/lib/locales'
import type { Client } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { countClientRead } from '@/plugins/usage'

import { MAX_ATLAS_ROUTE_LENGTH, parseAtlasRoute } from '../../seo/atlasRoute'
import { resolveAtlasSeo } from '../../seo/resolve'
import {
  type AtlasWixRouteResponse,
  hostOf,
  isProbePath,
  localeFromWixLang,
  normalizeAtlasPath,
  routeRelation,
  wixNotFound,
  wixRouteAnswer,
} from '../shape'

const querySchema = z.object({
  path: z.string().min(1).max(MAX_ATLAS_ROUTE_LENGTH),
  lang: z.string().max(20).optional(),
})

/**
 * GET /api/atlas/wix/route?path=/ca/ontario&lang=en
 *
 * One atlas route, shaped for a Wix Velo router (#1055): a serializer over the
 * resolution `GET /api/atlas/seo` answers from. Why it is a second shape, and
 * the `status`/`redirect` contract, are in `../shape.ts`.
 *
 * Contract notes the generated `routers.js` depends on:
 *
 * - **`links` is empty for the root, always**, and for any route this client
 *   canonicalises on its own host. ⚠ For the root this is also the WordPress
 *   plugin's trap 15: the root is the one page that may not canonicalise to
 *   another domain.
 * - ⚠ **Self-canonical assumes the router is installed at the mount
 *   `canonical.embed` names**, since only the router knows the URL Wix serves
 *   and this compares hosts. The Install tab validates the prefix against that
 *   mount; the two change together.
 * - **A language the site does not path-route gets `noindex` on sub-routes.**
 *   Nothing in the atlas is translated, so it would be one page at two
 *   addresses. The root is exempt: Wix Multilingual declares its languages.
 *
 * A root endpoint, like `/api/atlas/seo`, so `requireClientAccess` and
 * `countClientRead` stand in for the usage plugin's gates
 * (`docs/rules/endpoints.md`).
 *
 * ⚠ **It is metered like any other client read, and a server-rendered site
 * reads once per page view.** Only the router's `cache.ttl` bounds the volume;
 * a router published without its cache block crosses `HIGH_USAGE_THRESHOLD` on
 * ordinary traffic.
 */
export const atlasWixRoute: Endpoint = {
  path: '/atlas/wix/route',
  method: 'get',
  handler: async (req) => {
    const denied = requireClientAccess(req)
    if (denied) return denied

    const parsed = parseQuery(req, querySchema)
    if (!parsed.ok) return parsed.response
    const headers = publicReadCacheHeaders(req, ['events', 'regions'])

    const locale = localeFromWixLang(parsed.data.lang)

    const probe = isProbePath(parsed.data.path)
    const target = probe ? { kind: 'root' as const } : parseAtlasRoute(parsed.data.path)
    if (!target) return Response.json(wixNotFound(), { headers })

    // After the parse, so an unreadable `path` costs no quota unit.
    await countClientRead(req)

    try {
      const seo = await resolveAtlasSeo({ req, target, locale })
      const client = req.user as Client | undefined
      if (!seo) return Response.json(wixNotFound(), { headers })

      // A probe's path is a token, which would always compare as `moved`.
      const requestedRoute = probe ? seo.route : normalizeAtlasPath(parsed.data.path)
      const relation = routeRelation(requestedRoute, seo.route)

      // `Clients.language` is a bare ISO 639-1 subtag, not a locale, so the locale
      // is reduced to its language rather than the other way round (#957).
      const siteLanguage = client?.language ?? baseLanguage(DEFAULT_LOCALE)
      const offLanguage = baseLanguage(locale) !== siteLanguage

      const body: AtlasWixRouteResponse = wixRouteAnswer({
        seo,
        relation,
        noindex: probe || (offLanguage && seo.type !== 'root'),
        // A `view` publishes the document's canonical, so it is never self-canonical.
        selfCanonical:
          seo.type === 'root' ||
          (relation === 'exact' &&
            // The service's own primary page, not the request: a Wix router
            // calls us server-to-server and sends no `Origin` at all.
            hostOf(seo.canonical) === hostOf(primaryPageUrl(client?.site))),
      })
      return Response.json(body, { headers })
    } catch (error) {
      return readFailureResponse(req, error, 'Failed to build the page metadata for that route.', {
        msg: 'atlasWixRoute: read failed',
        clientId: req.user?.id,
        path: parsed.data.path,
      })
    }
  },
}
