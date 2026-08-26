/**
 * Response shapes for the root-level (non-collection) public endpoints —
 * `POST /api/contact-admin`, `GET /api/atlas/seo` and `GET /api/atlas/sitemap`.
 * Exported and committed so
 * client repos (SahajAtlasWeb, WeMeditateWeb, the WordPress plugin) can sync
 * them by raw GitHub URL, and kept in step with the OpenAPI schemas in
 * `src/plugins/openapi/customEndpoints.ts`. Deliberately self-contained — no
 * `@/` imports — so a cross-repo fetch of this single file resolves cleanly.
 */

/** Caller-supplied context attached to a contact message. Every key is optional. */
export type ContactAdminContext = {
  /** Route the sender was on, e.g. `/events/london-meetup`. */
  path?: string
  /** Absolute URL of the host page embedding the widget. */
  hostUrl?: string
  /** Locale the sender was browsing in. */
  locale?: string
  /** Error text/stack the sender was reporting, when the message is a crash report. */
  error?: string
  /** The sender's user-agent string. */
  userAgent?: string
}

/** `POST /api/contact-admin` request body. */
export type ContactAdminRequest = {
  /** The sender's message. */
  message: string
  /** The sender's address, used as the email's `Reply-To`. Omit for anonymous. */
  email?: string
  /** The caller's label for this channel, e.g. `"Issue report"`. Defaults to `"Message"`. */
  subject?: string
  /** Cloudflare Turnstile token from the caller's captcha widget. */
  turnstileToken: string
  /** Anything the caller wants included in the email's details block. */
  context?: ContactAdminContext
}

/** `POST /api/contact-admin` success body. Nothing is persisted — the email is the deliverable. */
export type ContactAdminResponse = {
  ok: true
}

/**
 * Machine-readable reason a contact message was refused, so a caller can react
 * rather than parse prose:
 *
 * - `captcha_failed` — the Turnstile token was invalid, expired, or already
 *   redeemed (tokens are single-use). The caller should reset its captcha widget
 *   and let the sender retry. Sent on the 403 captcha refusal only; the auth
 *   403 carries no `code`, and the 500 (captcha unavailable on our side)
 *   deliberately carries none either.
 * - `disposable_email` — the reply-to address is from a throwaway-email
 *   provider; ask the sender for a real address.
 * - `urls_not_allowed` — the message contains a link; links are refused in
 *   free text (spam vector). 400.
 */
export type ContactAdminErrorCode = 'captcha_failed' | 'disposable_email' | 'urls_not_allowed'

/**
 * Error body for a refused contact message — the standard
 * `{ errors: [{ message }] }` shape, extended with an optional stable `code`.
 */
export type ContactAdminError = {
  errors: { message: string; code?: ContactAdminErrorCode }[]
}

// ── GET /api/atlas/seo ───────────────────────────────────────────────────────

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
 * subtree gets `urls: []`, which is an answer rather than an error. Unpaginated:
 * a client owns a subtree of a corpus in the low thousands, and a cursor is
 * easier to add later than to remove.
 */
export type AtlasSitemapResponse = {
  /** ISO 8601 instant this answer was built. */
  generated: string
  /** Ascending by `route`, so the same ownership yields a byte-stable body. */
  urls: AtlasSitemapUrl[]
}
