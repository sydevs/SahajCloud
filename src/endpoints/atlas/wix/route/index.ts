import type { Endpoint } from 'payload'

import { z } from 'zod'

import { siteHosts } from '@/lib/clients/site'
import { parseQuery, readFailureResponse, requireClientAccess } from '@/lib/endpoints'
import { baseLanguage, DEFAULT_LOCALE, localeForLanguage } from '@/lib/locales'
import type { Client } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { countClientRead } from '@/plugins/usage'

import { MAX_ATLAS_ROUTE_LENGTH, parseAtlasRoute } from '../../seo/atlasRoute'
import { resolveAtlasSeo } from '../../seo/resolve'
import {
  type AtlasWixRouteResponse,
  isProbePath,
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
 * - **`links` is empty when the page is its own canonical** — the exact route,
 *   canonicalised on this site's own hosts — and for the root of a site that
 *   does not own it. ⚠ That second case is the WordPress plugin's trap 15: the
 *   root is the one page that may not canonicalise to another domain. A view of
 *   the root on its own site links its canonical, as `/api/atlas/seo` does.
 * - ⚠ **Self-canonical assumes the router is installed at `site.page`**, since
 *   only the router knows the URL Wix serves and this compares hosts. The
 *   Install tab validates the prefix against that page; the two change together.
 * - **A language other than the site's own gets `noindex` on sub-routes.**
 *   Nothing in the atlas is translated, so it would be one page at two
 *   addresses. The root is exempt: Wix Multilingual declares its languages.
 *   ⚠ The router sends no `lang` on the site's primary language, which is the
 *   service's own (`Clients.language`), not English.
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

    const client = req.user as Client | undefined
    // `Clients.language` is a bare ISO 639-1 subtag, not a locale (#957).
    const siteLanguage = client?.language ?? baseLanguage(DEFAULT_LOCALE)
    const requested = parsed.data.lang || siteLanguage
    const locale = localeForLanguage(requested)
    const offLanguage = requested.split('-')[0].toLowerCase() !== siteLanguage

    const probe = isProbePath(parsed.data.path)
    const target = probe ? { kind: 'root' as const } : parseAtlasRoute(parsed.data.path)
    if (!target) return Response.json(wixNotFound(), { headers })

    // After the parse, so an unreadable `path` costs no quota unit.
    await countClientRead(req)

    try {
      const seo = await resolveAtlasSeo({ req, target, locale })
      if (!seo) return Response.json(wixNotFound(), { headers })

      // A probe's path is a token, which would always compare as `moved`.
      const requestedRoute = probe ? seo.route : normalizeAtlasPath(parsed.data.path)
      const relation = routeRelation(requestedRoute, seo.route)

      // The service's own primary page, not the request: a Wix router calls us
      // server-to-server and sends no `Origin` at all.
      const onOwnSite = siteHosts(client?.site?.domain).includes(
        URL.parse(seo.canonical ?? '')?.host ?? '',
      )

      const body: AtlasWixRouteResponse = wixRouteAnswer({
        seo,
        relation,
        noindex: probe || (offLanguage && seo.type !== 'root'),
        // A `view` publishes the document's canonical, so it is never self-canonical.
        selfCanonical: onOwnSite ? relation === 'exact' : seo.type === 'root',
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
