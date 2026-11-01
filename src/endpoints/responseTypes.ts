/**
 * Response shapes for the root-level (non-collection) public endpoints —
 * `GET /api/atlas/seo` and `GET /api/atlas/sitemap`. `POST /api/contact-admin`
 * was a third until it became the `user-messages` collection and its built-in
 * create endpoint (#632).
 *
 * Exported and committed so client repos (SahajAtlasWeb, WeMeditateWeb, the
 * WordPress plugin) can sync them by raw GitHub URL, and kept in step with the
 * OpenAPI schemas in
 * `src/plugins/openapi/customEndpoints.ts`. Deliberately self-contained — no
 * `@/` imports — so a cross-repo fetch of this single file resolves cleanly.
 */

/**
 * One `<link rel="alternate">` row. `hreflang` is a widget locale code or the
 * literal `x-default`.
 */
export type AtlasSeoAlternate = {
  hreflang: string
  href: string
}

/**
 * Open Graph properties, keyed by their `property` attribute so a consumer can
 * emit them in a loop without knowing any of them by name.
 *
 * `og:site_name` is deliberately absent — the host page knows what site it is
 * and we do not. Every value is already plain text; none needs escaping beyond
 * the ordinary HTML-attribute escaping a template applies to any value.
 */
export type AtlasSeoOpenGraph = Record<string, string>

/** One rung of the region ancestry, root first, ending at the page itself. */
export type AtlasSeoBreadcrumb = {
  name: string
  /**
   * Atlas route, e.g. `/gb/london` — or `null` when no path can be built for
   * that rung, which happens when a region in the chain has a blank slug. It
   * goes `null` in exactly the cases `url` does, rather than an empty string
   * that would render as a link back to the current page.
   */
  route: string | null
  /** Canonical URL for that route, or `null` when one can't be published. */
  url: string | null
}

/** A postal address, plus the one-line rendering most hosts actually display. */
export type AtlasSeoAddress = {
  venueName: string | null
  street: string | null
  room: string | null
  city: string | null
  region: string | null
  postCode: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  /** `street, room, city, region, country postCode` — blank parts dropped. */
  oneLine: string
}

/** When an event happens, in both a renderable and a machine-readable form. */
export type AtlasSeoSchedule = {
  /** e.g. `Every week on Saturday at 9:26 AM`. Empty when there is no schedule. */
  oneLine: string
  /** ISO 8601 instant of the first occurrence, or `null` for a dormant event. */
  startDate: string | null
  /** ISO 8601 instant of the final occurrence's end, `null` when open-ended. */
  endDate: string | null
  /** IANA zone the event's wall-clock times are in. */
  timezone: string | null
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null
  /** Two-letter recurrence weekdays (`MO`…`SU`); empty unless weekly. */
  weekdays: string[]
  /** `HH:MM` local end time, when the event declares one. */
  endTime: string | null
  /** True for an event marked dormant — it has no active schedule. */
  inactive: boolean
}

/** An image, ready for `og:image` or an `<img>` in the rendered children. */
export type AtlasSeoImage = {
  url: string
  alt: string | null
}

/** One class in a region's listing. */
export type AtlasSeoEventCard = {
  id: number
  /** Atlas route for this event, e.g. `/gb/london/1204`. */
  route: string | null
  /** Canonical URL for that route, or `null` when one can't be published. */
  url: string | null
  title: string
  /** One-line schedule, as in {@link AtlasSeoSchedule.oneLine}. */
  schedule: string
  /** One-line address; empty for an online class. */
  address: string
  online: boolean
}

/** The body content of an event page. */
export type AtlasSeoEventContent = {
  title: string
  /** ISO 639-1 codes the class is conducted in. */
  languages: string[]
  schedule: AtlasSeoSchedule
  /** `null` for an online class. */
  address: AtlasSeoAddress | null
  onlineUrl: string | null
  website: string | null
  /**
   * The description as plain-text paragraphs, one per block, ready to wrap in
   * whatever markup the host uses. **No HTML crosses this wire** — see the
   * endpoint's docs for why.
   */
  paragraphs: string[]
  images: AtlasSeoImage[]
}

/** The body content of a region page. */
export type AtlasSeoRegionContent = {
  name: string
  subtitle: string | null
  level: 'country' | 'region' | 'city' | 'venue'
  /**
   * Classes in this region **and every region beneath it**, so a city's page
   * includes classes held at its shared venues.
   */
  events: AtlasSeoEventCard[]
  /** How many such classes exist in total; `events` may be capped below this. */
  eventCount: number
}

/**
 * The body content of the atlas landing page (#739).
 *
 * The root names no document, so its copy is seeded on the
 * `sy-atlas-translations` global rather than read off a region or an event.
 * `paragraphs` carries the same plain-text-per-block shape an event's content
 * uses, so a host renders every route through one code path — it holds the
 * landing page's description when there is one, and is empty when there is not.
 */
export type AtlasSeoRootContent = {
  paragraphs: string[]
}

/** Fields every atlas SEO answer carries, whatever the route resolved to. */
type AtlasSeoBase = {
  /** The normalized route this answer describes — view segments dropped. */
  route: string
  /** The locale the answer was rendered for. */
  locale: string
  /** Page title, ready for `<title>`. */
  title: string
  /** Meta description — plain text, already length-bounded. `null` if none. */
  description: string | null
  /**
   * The canonical URL, byte-identical to the document's own `webUrl`, or `null`
   * when no owner can publish one. **Locale-free by design**: nothing in the
   * atlas is translated per locale, so every locale shares one canonical and
   * the alternates below differ only by the widget's UI language.
   */
  canonical: string | null
  /** hreflang rows: the widget's locales plus `x-default`. Empty if no canonical. */
  alternates: AtlasSeoAlternate[]
  openGraph: AtlasSeoOpenGraph
  /**
   * A complete JSON-LD document, **already serialized and escaped** for direct
   * embedding in `<script type="application/ld+json">`. Emit it verbatim — do
   * not re-serialize it, and do not HTML-escape it again.
   */
  jsonLd: string
  /** Region ancestry, root first, ending at this page. */
  breadcrumbs: AtlasSeoBreadcrumb[]
}

/**
 * `GET /api/atlas/seo` success body.
 *
 * A discriminated union on `type`, so a consumer narrows once and gets the
 * content shape for that variant — rather than a flat object where half the
 * fields are `null` on any given route.
 */
export type AtlasSeoResponse =
  | (AtlasSeoBase & { type: 'root'; id: null; content: AtlasSeoRootContent })
  | (AtlasSeoBase & { type: 'region'; id: number; content: AtlasSeoRegionContent })
  | (AtlasSeoBase & { type: 'event'; id: number; content: AtlasSeoEventContent })

// ── GET /api/atlas/sitemap ───────────────────────────────────────────────────

/** One publishable URL — a `<url>` element, in the fields a sitemap needs. */
export type AtlasSitemapUrl = {
  /**
   * The canonical URL to publish, **byte-identical** to the `canonical` that
   * `GET /api/atlas/seo?route=…` returns for the `route` beside it. Both are the
   * document's own `webUrl`, read rather than recomputed, so a sitemap and a
   * page's `<link rel="canonical">` can never name different URLs.
   */
  loc: string
  /** ISO 8601 instant the document was last edited — `<lastmod>`. */
  lastmod: string
  /**
   * The atlas route this URL is of, e.g. `/nl/amsterdam` — the `?atlas=` value
   * to pass back to `GET /api/atlas/seo`. Carried so a consumer can cross-check
   * or pre-render without re-parsing `loc`.
   */
  route: string
}

/**
 * `GET /api/atlas/sitemap` success body.
 *
 * Every entry is a URL **this client owns** — a client that owns no region
 * subtree gets `urls: []`, which is an answer rather than an error.
 *
 * **One client may additionally be the canonical *fallback*** (#652), named on
 * `sy-atlas-config`. Its answer is every route no other client owns — the
 * complement of the ownership map — so pages nobody declares are in somebody's
 * sitemap rather than nobody's. The response shape is unchanged, and no other
 * client's answer is affected.
 *
 * Unpaginated. That was justified by a client owning a *subtree*, which the
 * fallback client does not: its answer approaches the whole corpus, low
 * thousands of documents and a few hundred KB. Still one response — a cursor is
 * easier to add later than to remove — but size it against the corpus, not
 * against a subtree.
 */
export type AtlasSitemapResponse = {
  /**
   * ISO 8601 instant this answer was built — and the one field that moves
   * between two otherwise identical answers, so diff `urls`, not the body.
   */
  generated: string
  /** Ascending by `route`, so unchanged ownership yields an unchanged list. */
  urls: AtlasSitemapUrl[]
}

// ── GET /api/atlas/wix/route ─────────────────────────────────────────────────

/**
 * One `<meta>` row, keyed the way Wix's `ok(page, data, head)` wants it.
 *
 * ⚠ **A union, not an object with two optional keys.** Wix reads `name` for a
 * standard meta and `property` for an Open Graph one, and a row carrying both
 * is not a thing. Narrowing on which key is present is how the router's own
 * code decides nothing at all — it passes the array through verbatim.
 */
export type AtlasWixMetaTag =
  { name: string; content: string } | { property: string; content: string }

/** One `<link>` row. `hreflang` is present only on an `alternate`. */
export type AtlasWixLink = {
  rel: string
  href: string
  hreflang?: string
}

/**
 * The `head` half of a Wix router answer, in the shape `ok()` takes.
 *
 * **`description` and `robots` are in `metaTags` and nowhere else** — Wix's
 * `WixRouterPage` carries no top-level `description` or `noIndex` that its
 * renderer honours, so a top-level copy would be silently dropped and the page
 * would publish with neither.
 */
export type AtlasWixHead = {
  /** Ready for `<title>`, already plain text. */
  title: string
  metaTags: AtlasWixMetaTag[]
  /**
   * **Empty when the canonical is the page being asked for**, which is the
   * common case: Wix then writes the self-canonical itself, and Wix Multilingual
   * writes the `hreflang` cluster for the languages the site publishes. Writing
   * our own alongside those would give the page two canonicals.
   *
   * Non-empty only when the canonical names a different URL — a region another
   * client owns — in which case it is that canonical plus its own alternates.
   */
  links: AtlasWixLink[]
  /**
   * JSON-LD as **objects**, not a string: Wix serializes `structuredData`
   * itself. The identical document `GET /api/atlas/seo` returns pre-serialized
   * as `jsonLd` — see `wixDocument.ts` for why it is parsed rather than rebuilt.
   */
  structuredData: Record<string, unknown>[]
}

/** The `data` half — what the router hands its page through `getRouterData()`. */
export type AtlasWixRouteData = {
  type: 'root' | 'region' | 'event'
  /** The normalized atlas route this answer describes. */
  route: string
  /**
   * The crawlable body, as HTML, for `$w('#sahajAtlasContent').html`.
   *
   * ⚠ The one place the atlas SEO surface emits markup. Every CMS value in it
   * is escaped here (`wixHtml.ts`), because a Wix `html` sink sanitizes
   * nothing. Links are real `<a>` elements, so a crawler follows them.
   */
  bodyHtml: string
}

/**
 * `GET /api/atlas/wix/route` success body — always a 200 at the HTTP layer.
 *
 * ⚠ **`status` is the answer about the *page*, not about this request.** The
 * router has to render something for every path Wix hands it, so a 404 arrives
 * as a 200 carrying `status: 404` and the router calls `notFound()`. An HTTP 404
 * here would be indistinguishable from the endpoint being gone, which is the
 * case the router must degrade for rather than propagate.
 */
export type AtlasWixRouteResponse = {
  /** `200` renders, `301` redirects to `redirect`, `404` is `notFound()`. */
  status: 200 | 301 | 404
  /**
   * The **atlas route** to redirect to on a `301` — `/gb/london`, never a full
   * URL and never prefixed. The router owns its own prefix, so it composes
   * `/${prefix}${redirect}`; a URL from us would send a visitor off-site
   * whenever the canonical names another client's domain. `null` otherwise.
   */
  redirect: string | null
  head: AtlasWixHead
  /** `null` on a `301` or a `404` — there is no page to render. */
  data: AtlasWixRouteData | null
  /** What the router should pass as `ok()`'s `cache.ttl`. */
  cacheSeconds: number
}

// ── GET /api/atlas/wix/sitemap ───────────────────────────────────────────────

/**
 * One `WixRouterSitemapEntry`, as the router's `*_SiteMap` function returns it.
 *
 * ⚠ **`url` is relative to the site root and DOES carry the router's prefix** —
 * `/free-classes/ca/ontario` — which is the opposite of
 * `AtlasWixRouteResponse.redirect`. A redirect passes through the router, which
 * composes its own prefix; a sitemap entry has nothing between it and Wix, so it
 * has to arrive as the address the site serves. Wix resolves it against the
 * site's own domain, which is why the answer is filtered to this client's host.
 */
export type AtlasWixSitemapEntry = {
  url: string
  title: string
  /** ISO 8601 instant the document was last edited. */
  lastmod: string
}
