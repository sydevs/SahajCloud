import { z } from 'zod'

import { WIX_PREFIX_MAX_LENGTH, WIX_PREFIX_PATTERN } from '@/lib/atlas/wixPrefix'

import { MAX_ATLAS_ROUTE_LENGTH } from '../seo/atlasRoute'

/**
 * The two Wix endpoints' contract, declared once (#1055): the handlers parse
 * their queries with these, the response types are inferred from them, and the
 * OpenAPI shim publishes them (`customEndpoints.ts`), so the documented shape
 * cannot drift from the one served.
 *
 * ⚠ **A leaf module**: zod and two constants, so the shim and the unit lane can
 * import it without the resolvers the handlers reach.
 */

/** `GET /api/atlas/wix/route` query. */
export const wixRouteQuery = z.object({
  path: z
    .string()
    .min(1)
    .max(MAX_ATLAS_ROUTE_LENGTH)
    .describe(
      'The atlas route, as the router reads it off `request.path` — `/ca/ontario`. A ' +
        '`sahaj-atlas-probe-*` path is answered as the atlas root with `robots: noindex`, ' +
        'which the CMS’s routing probe depends on.',
    ),
  lang: z
    .string()
    .max(20)
    .optional()
    .describe(
      'The page’s language subtag (`fr`), from `request.baseUrl` on a Multilingual site. ' +
        'Empty means the service’s own language. Any other language gets `robots: noindex` ' +
        'on sub-routes, since nothing in the atlas is translated; one with no SEO locale is ' +
        'answered in English rather than refused.',
    ),
})

/** `GET /api/atlas/wix/sitemap` query. */
export const wixSitemapQuery = z.object({
  // The Install tab's own rule, so a prefix it accepts cannot be refused here.
  prefix: z
    .string()
    .min(1)
    .max(WIX_PREFIX_MAX_LENGTH)
    .regex(WIX_PREFIX_PATTERN, {
      message: 'A router prefix is one lowercase path segment, e.g. free-classes.',
    })
    .describe(
      'The router’s dynamic-page prefix, one lowercase path segment — `free-classes`. ' +
        'Spliced into every entry’s `url`.',
    ),
})

/**
 * `GET /api/atlas/wix/route` success body.
 *
 * ⚠ **`status` is the answer about the *page*, not about this request.** A 404
 * arrives as HTTP 200 carrying `status: 404`, because an HTTP 404 would be
 * indistinguishable from the endpoint being gone — the case the router must
 * degrade for.
 */
export const wixRouteResponse = z.object({
  status: z
    .literal([200, 301, 404])
    .describe('About the page: `200` renders, `301` redirects, `404` is `notFound()`.'),
  redirect: z
    .string()
    .nullable()
    .describe(
      'On a `301`, the **atlas route** to redirect to — never a URL, never prefixed. The ' +
        'router composes `/${prefix}${redirect}`; a URL from us would send a visitor ' +
        'off-site whenever the canonical names another client’s domain.',
    ),
  head: z
    .object({
      title: z.string().describe('Ready for `<title>`, already plain text.'),
      metaTags: z
        .array(
          // ⚠ A union, not one object with two optional keys: Wix reads
          // `name` or `property`, never both.
          z.union([
            z.object({
              name: z.string().describe('A standard meta — `description`, `robots`.'),
              content: z.string(),
            }),
            z.object({
              property: z.string().describe('An Open Graph property — `og:title`.'),
              content: z.string(),
            }),
          ]),
        )
        .describe(
          '`description` and `robots` live here and nowhere else — Wix honours no ' +
            'top-level copy of either.',
        ),
      links: z
        .array(
          z.object({
            rel: z.string().describe('`canonical` or `alternate`.'),
            href: z.string(),
            hreflang: z.string().optional().describe('On an `alternate` only.'),
          }),
        )
        .describe(
          'Empty when the page is its own canonical: Wix then writes the self-canonical and ' +
            'Wix Multilingual the `hreflang` cluster, and ours beside them would give the ' +
            'page two canonicals.',
        ),
      structuredData: z
        .array(z.looseObject({}))
        .describe(
          'JSON-LD as objects — the identical document `/api/atlas/seo` returns ' +
            'pre-serialized as `jsonLd`. Wix serializes it itself.',
        ),
    })
    .describe('The `head` half of a Wix router answer, in the shape `ok()` takes.'),
  data: z
    .object({
      bodyHtml: z
        .string()
        .describe(
          'The crawlable body, as escaped HTML (`wixBody.tsx`), for `$w(…).html`, which ' +
            'sanitizes nothing. Links are real `<a>` elements. The one place this surface ' +
            'emits markup.',
        ),
    })
    .nullable()
    .describe(
      'What the router hands its page through `getRouterData()`. `null` on a `301` or a ' +
        '`404` — there is no page to render.',
    ),
  cacheSeconds: z
    .number()
    .describe('What to pass as `ok()`’s `cache.ttl`. The router’s cache bounds our volume.'),
})

export type AtlasWixRouteResponse = z.infer<typeof wixRouteResponse>

/**
 * One `WixRouterSitemapEntry`.
 *
 * ⚠ **`url` is relative to the site root and DOES carry the router's prefix** —
 * the opposite of `redirect`, which the router prefixes itself. Nothing sits
 * between a sitemap entry and Wix.
 */
export const wixSitemapEntry = z.object({
  url: z
    .string()
    .describe(
      'Relative to the site root, **with** the router prefix — `/free-classes/ca/ontario`.',
    ),
  title: z.string().describe('The document’s display name, falling back to its route.'),
  lastmod: z.string().meta({
    format: 'date-time',
    description: 'When the document was last edited — its `updatedAt`.',
  }),
})

export type AtlasWixSitemapEntry = z.infer<typeof wixSitemapEntry>
