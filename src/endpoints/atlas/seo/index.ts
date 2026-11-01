import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { errorResponse, parseQuery, requireActiveClient } from '@/lib/endpoints'
import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE, isValidLocale, LOCALES } from '@/lib/locales'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed, countClientRead } from '@/plugins/usage'

import { MAX_ATLAS_ROUTE_LENGTH, parseAtlasRoute } from './atlasRoute'
import { resolveAtlasSeo } from './resolve'

/** Pre-computed for the schema validation message (static, immutable). */
const VALID_LOCALES_LIST = LOCALES.map((locale) => locale.code).join(', ')

const querySchema = z.object({
  route: z.string().min(1).max(MAX_ATLAS_ROUTE_LENGTH),
  locale: z
    .string()
    .max(20)
    .optional()
    .refine((value) => value === undefined || isValidLocale(value), {
      message: `Unknown locale. Expected one of: ${VALID_LOCALES_LIST}.`,
    }),
})

/**
 * GET /api/atlas/seo?route=/gb/london&locale=fr
 *
 * Everything a host page needs to render one atlas route: its `<head>` metadata
 * **and** the content it renders as children of `<sahaj-atlas>`, in one call
 * (#645, stage C3 of the white-label & SEO programme).
 *
 * **Keyed by route, not by id.** What a consumer holds is the `?atlas=/gb/london`
 * string off its own URL. An id-keyed endpoint would make every consumer resolve
 * path → id first — two round trips per page render, and the same resolution
 * logic written once in PHP and once in TypeScript, which is precisely what
 * "generated once, served as data" exists to avoid. The route is parsed with the
 * **same rule the widget applies to the same string** (see `./atlasRoute`), so
 * the server-rendered page and the widget that upgrades over it can never
 * disagree about which document a URL names.
 *
 * **A route is keyed by its terminal segment**, so ancestry that has gone stale
 * — a region moved in the tree, a country re-slugged to its ISO code (#556) —
 * still resolves, and the `route` and `canonical` in the answer name the URL the
 * host should redirect to. The alternative would 404 every inbound link into a
 * restructured subtree, which is the opposite of what an SEO endpoint is for.
 *
 * **Why it lives in SahajCloud rather than a shared package.** Only this service
 * can walk region ownership to the client that owns a region's canonical URLs
 * (#640), and only it holds the Lexical description. Three consumers in three
 * toolchains — Vike/TypeScript, PHP, and the widget — would otherwise need three
 * implementations of all of it.
 *
 * **Contract notes a consumer must not guess at:**
 *
 * - `canonical` is the document's own `webUrl`, **read, never recomputed**, so
 *   it is byte-identical to what every other surface publishes.
 * - `canonical` is **locale-free**, and so is the `x-default` alternate. Nothing
 *   in the atlas is localized; locales differ only in the widget's UI language,
 *   which the `alternates` carry as `?locale=`.
 * - `jsonLd` is **already serialized and escaped** for a
 *   `<script type="application/ld+json">`. Emit it verbatim; do not
 *   re-serialize it and do not HTML-escape it again.
 * - **No HTML crosses this wire.** A description arrives as
 *   `content.paragraphs`, plain text, one entry per block. The WordPress plugin
 *   echoes this into a template that never passes through `wp_kses`, so markup
 *   we emit is markup nothing downstream sanitizes.
 * - A **region has no description** in the CMS, so `description` is `null` and
 *   `og:description` is absent on a region route. The host writes that line, in
 *   its own language — we would only be able to write it in English.
 * - `og:site_name` is deliberately absent: the host knows what site it is.
 * - A region's `content.events` covers **the region and everything beneath it**,
 *   capped at 50; `content.eventCount` is the true total.
 * - **The atlas root is answered, not refused** (#739). `/` and every bare view
 *   route (`/search`, `/calendar`, `/filters`, `/online`, `/share`, `/add`) return one
 *   document, of `type: 'root'`, with `id: null`, `route: '/'` and empty
 *   `breadcrumbs`. Those are the routes most hosts mount, so refusing them left
 *   the one page a host links from its own nav as the only page with no
 *   metadata of its own. Its title and description are seeded on
 *   `sy-atlas-translations`, and its `canonical` is the caller's own verified
 *   mount page — a host remains free to ignore both and write its own.
 * - A **404 now means the string is not a route we will read** — carrying a
 *   query, fragment or whitespace, or over the segment cap — or names a region
 *   or event that does not exist. "Names nothing" and "is not a route" are
 *   deliberately different answers. A route past
 *   {@link MAX_ATLAS_ROUTE_LENGTH} is a **400**: the query schema refuses it
 *   before the parser sees it, as it does an empty one.
 * - A root route's `description` is `null` in any locale carrying none — the
 *   same rule a region follows, and since #778 that is a locale outside the ten
 *   the seed writes. Its `title` is always a
 *   non-blank string, because `<title>` is mandatory markup, and it exhausts
 *   the locale's own words before it borrows another language's —
 *   {@link getRootSeoStrings} owns that order, and `./rootStrings` is the only
 *   place it is written down.
 *
 * Registered at the config root rather than on a collection because the route
 * may name a region *or* an event, so no collection owns it — which means the
 * usage plugin's `beforeOperation` gates don't fire for the handler itself, so
 * `assertClientOriginAllowed` and `countClientRead` are called directly (see
 * `docs/rules/endpoints.md`). The collection reads it forwards *do* run them, so
 * published-only access and project visibility apply as usual, and the meter is
 * idempotent per request, so they add nothing to the one count (#891).
 *
 * Returns `AtlasSeoResponse` (see ./responseTypes).
 */
export const atlasSeo: Endpoint = {
  path: '/atlas/seo',
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
    // The schema already refused anything else; this narrows `string` to the
    // locale union the reads take, without a cast.
    const locale: LocaleCode = parsed.data.locale ?? DEFAULT_LOCALE

    const target = parseAtlasRoute(parsed.data.route)
    if (!target) return errorResponse('That is not a valid atlas route.', 404)

    // A root endpoint runs no collection `beforeOperation` hook, so it counts
    // itself. Idempotent, so the `regions` read a region or event route makes
    // adds nothing — and the **root** route reads no metered collection at all,
    // which is why it counted nothing before #891.
    await countClientRead(req)

    try {
      const seo = await resolveAtlasSeo({ req, target, locale })
      if (!seo) return errorResponse('That route does not name a region or an event.', 404)

      return Response.json(seo, { headers: publicReadCacheHeaders(req, ['events', 'regions']) })
    } catch (error) {
      // The forwarded reads run the client-query gates, which throw APIError —
      // surface status + message verbatim rather than reporting a server fault.
      if (error instanceof APIError) return errorResponse(error.message, error.status)
      req.payload.logger.error({
        msg: 'atlasSeo: read failed',
        clientId: req.user?.id,
        route: parsed.data.route,
        error: error instanceof Error ? error.message : String(error),
      })
      return errorResponse('Failed to build the SEO metadata for that route.', 500)
    }
  },
}
