import type { AtlasWixRouteResponse } from '../../../responseTypes'
import type { Endpoint, PayloadRequest } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { splitMountKey } from '@/lib/clients/verification'
import { errorResponse, parseQuery, requireActiveClient } from '@/lib/endpoints'
import { baseLanguage, DEFAULT_LOCALE } from '@/lib/locales'
import type { Client } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed, countClientRead } from '@/plugins/usage'

import { MAX_ATLAS_ROUTE_LENGTH } from '../../seo/atlasRoute'
import { resolveAtlasSeo } from '../../seo/resolve'
import { wixNotFound, wixRouteAnswer } from '../wixDocument'
import { localeFromWixLang } from '../wixLang'
import { isProbePath, normalizeAtlasPath, parseAtlasRoute, routeRelation } from '../wixRoute'

const querySchema = z.object({
  path: z.string().min(1).max(MAX_ATLAS_ROUTE_LENGTH),
  lang: z.string().max(20).optional(),
})

/**
 * The host this client publishes its own canonical URLs on, or `null`.
 *
 * Read off `canonical.embed` — the mount an operator designated and the
 * verification job confirmed — rather than off the request, because a Wix router
 * calls us server-to-server and sends no `Origin` at all.
 */
function canonicalHostOf(req: PayloadRequest): string | null {
  const embed = (req.user as Client | undefined)?.canonical?.embed
  return embed ? (splitMountKey(embed)?.domain ?? null) : null
}

/** The host a canonical URL names, or `null` when there is no canonical. */
function hostOf(canonical: string | null): string | null {
  return canonical ? (URL.parse(canonical)?.host ?? null) : null
}

/**
 * GET /api/atlas/wix/route?path=/ca/ontario&lang=en
 *
 * One atlas route, shaped for a Wix Velo router (#1055). A thin serializer over
 * `resolveAtlasSeo` — the same resolution `GET /api/atlas/seo` answers from — in
 * the shape `ok()` / `redirect()` / `notFound()` take.
 *
 * **Why a second shape rather than changing the first.** Wix needs JSON-LD as
 * objects, needs the crawlable body as HTML, and reads `description` and
 * `robots` only out of `metaTags`. Each of those would break a current reader
 * of `/api/atlas/seo`: the WordPress plugin echoes the pre-escaped `jsonLd`
 * string raw and renders `content` as plain text through output that never
 * passes `wp_kses`; WeMeditateWeb parses the published shape; and the plugin
 * versions already installed on 13 sites cannot be changed. `wixDocument.ts`
 * carries the full list.
 *
 * **Contract notes the generated `routers.js` depends on:**
 *
 * - **`status` describes the page, not this request.** Every answer is HTTP 200.
 *   A 404 arrives as `status: 404`, because the router has to render something
 *   for every path Wix hands it and an HTTP 404 here is indistinguishable from
 *   the endpoint being gone — the one case the router must degrade for.
 * - **`redirect` is an atlas route, never a URL and never prefixed.** The router
 *   owns its prefix. A full URL from us would send a visitor off-site whenever
 *   the canonical names another client's domain.
 * - **A view route renders; a moved route redirects.** `/gb/london/calendar` and
 *   `/search` are pages the widget itself links to, so they render and publish
 *   the document's canonical. `/events/1204` and a stale slug are a `301`. See
 *   {@link routeRelation}.
 * - **`links` is empty for the root, always**, and for any other route whose
 *   canonical this client publishes on its own host. Wix then writes the
 *   self-canonical, and Wix Multilingual the `hreflang` cluster. ⚠ For the root
 *   this is also the trap the WordPress plugin numbers 15: a root canonical
 *   naming **another** domain must not be published, since the root is the one
 *   page that may not canonicalise elsewhere. A region may, and does.
 * - ⚠ **Self-canonical assumes the router is installed at the mount
 *   `canonical.embed` names.** Only the router knows the URL Wix is serving, so
 *   the comparison here is of hosts. The Install tab validates the prefix
 *   against that mount, which is what makes the assumption hold; the two change
 *   together.
 * - **A `sahaj-atlas-probe-*` path answers as the root with `robots: noindex`,**
 *   or `probeRouting` (#644) fails against the host's real 404 and demotes a
 *   working client. {@link isProbePath} carries the detail.
 * - **A language the site does not path-route gets `noindex` on sub-routes.**
 *   Nothing in the atlas is translated, so `/fr/free-classes/ca` and
 *   `/free-classes/ca` would be the same page at two addresses in a crawler's
 *   index. The root is exempt: Wix Multilingual writes its hreflang cluster, so
 *   the languages of the landing page are declared rather than duplicated.
 *
 * Registered at the config root for the same reason `/api/atlas/seo` is — the
 * route may name a region *or* an event — so the usage plugin's
 * `beforeOperation` gates do not fire for the handler and
 * `assertClientOriginAllowed` and `countClientRead` are called directly (see
 * `docs/rules/endpoints.md`).
 *
 * ⚠ **It is metered like any other client read, and a server-rendered site
 * reads once per page view.** What bounds the volume is the router's own
 * `cache.ttl`, set from `cacheSeconds` — not anything here. A Wix client that
 * publishes the generated router without its cache block will cross
 * `HIGH_USAGE_THRESHOLD` on ordinary traffic.
 *
 * Returns `AtlasWixRouteResponse` (see ../../responseTypes).
 */
export const atlasWixRoute: Endpoint = {
  path: '/atlas/wix/route',
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

    const locale = localeFromWixLang(parsed.data.lang)

    const probe = isProbePath(parsed.data.path)
    // The probe is answered as the root — the document the mount itself serves —
    // rather than as whatever its random token would parse to.
    const target = probe ? { kind: 'root' as const } : parseAtlasRoute(parsed.data.path)
    if (!target) return Response.json(wixNotFound(), { headers: cacheHeaders(req) })

    // Counted once, after the gates and the parse — the same point `/api/atlas/seo`
    // counts, so an unreadable `path` costs a quota unit on neither.
    await countClientRead(req)

    try {
      const seo = await resolveAtlasSeo({ req, target, locale })
      if (!seo) return Response.json(wixNotFound(), { headers: cacheHeaders(req) })

      // A probe never compares routes: its path is a token, so every comparison
      // would say `moved` and redirect the probe away from the page it is
      // testing.
      const requestedRoute = probe ? seo.route : normalizeAtlasPath(parsed.data.path)
      const relation = routeRelation(requestedRoute, seo.route)

      // Nothing in the atlas is translated, so a second language's sub-route is
      // the same page at a second address. The root is exempt — see the contract
      // note above.
      // `Clients.language` is a bare ISO 639-1 subtag from `getLanguageOptions()`,
      // not one of the nineteen locales — so the locale is reduced to its own
      // language before the comparison rather than the other way round (#957).
      const siteLanguage =
        (req.user as Client | undefined)?.language ?? baseLanguage(DEFAULT_LOCALE)
      const offLanguage = baseLanguage(locale) !== siteLanguage

      const body: AtlasWixRouteResponse = wixRouteAnswer({
        seo,
        relation,
        noindex: probe || (offLanguage && seo.type !== 'root'),
        // A `view` answer is deliberately not self-canonical: it renders, and
        // publishes the document's own canonical so a crawler folds the view
        // and the page together.
        selfCanonical:
          seo.type === 'root' ||
          (relation === 'exact' && hostOf(seo.canonical) === canonicalHostOf(req)),
      })
      return Response.json(body, { headers: cacheHeaders(req) })
    } catch (error) {
      if (error instanceof APIError) return errorResponse(error.message, error.status)
      req.payload.logger.error({
        msg: 'atlasWixRoute: read failed',
        clientId: req.user?.id,
        path: parsed.data.path,
        error: error instanceof Error ? error.message : String(error),
      })
      return errorResponse('Failed to build the page metadata for that route.', 500)
    }
  },
}

/** The same edge-cache policy `/api/atlas/seo` publishes, over the same tags. */
function cacheHeaders(req: PayloadRequest): Record<string, string> {
  return publicReadCacheHeaders(req, ['events', 'regions'])
}
