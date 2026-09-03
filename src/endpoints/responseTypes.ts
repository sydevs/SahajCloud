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
