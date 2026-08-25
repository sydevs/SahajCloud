/**
 * Resolve an atlas route — the `?atlas=/gb/london` string a host page holds —
 * to the region or event it names.
 *
 * This is the **same rule the widget applies to the same string**
 * (`resolveStack` in sydevs/SahajAtlasWeb `src/lib/shape/path.ts`): a terminal
 * segment of all digits is an event id, anything else is a region slug, and the
 * widget's own view segments never name a region. Keeping the rule identical is
 * the point of serving this as data — a host that renders `?atlas=/507/register`
 * server-side and a widget that upgrades over it must agree on what that route
 * is *of*, or the page's canonical describes a different document than its body.
 *
 * Pure and env-free: the endpoint does the reads, this decides what to read.
 */

/**
 * Words that never name a region, dropped wherever they appear.
 *
 * `search` / `calendar` / `filters` / `register` / `share` / `online` are the
 * widget's own routed views, and `preview` is its live-preview boot route: each
 * is a *view of* the entity beside it, so dropping it leaves the entity the page
 * is actually about (`/gb/london/1204/register` → event 1204). `events` /
 * `areas` / `regions` / `venues` are legacy Atlas URL prefixes that carry no
 * view of their own, so dropping them makes an old inbound link resolve to the
 * same document its modern route does.
 *
 * The same set as `RESERVED_SLUGS` in the widget, matched case-insensitively.
 * A region slug can never silently shadow one of these — that is the guarantee
 * the list exists for, on both sides.
 */
const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  'search',
  'calendar',
  'filters',
  'register',
  'share',
  'online',
  'preview',
  'events',
  'areas',
  'regions',
  'venues',
])

/**
 * Longest route we will parse. A public endpoint reading a caller-supplied
 * string needs a ceiling, and this one is far above any real route: the deepest
 * region chain is four levels (country → region → city → venue) plus an event
 * id, and the longest slug in the tree is well under 100 characters.
 */
export const MAX_ATLAS_ROUTE_LENGTH = 512

/** Ceiling on segment count, for the same reason. Real routes use at most five. */
const MAX_ATLAS_ROUTE_SEGMENTS = 12

/** Largest event id we will accept — Postgres `int4`, which is the column type. */
const MAX_EVENT_ID = 2147483647

/**
 * What a route names. A discriminated union rather than a struct with two
 * nullable keys, so the endpoint's two read paths narrow exhaustively and a
 * region can never be handed an event's lookup.
 *
 * **Both variants are keyed by the terminal segment alone**, which is the
 * widget's own rule (`resolvePath`): a region slug is globally unique, and an
 * event id needs no ancestry. Everything before the terminal segment is
 * *ancestry*, and ancestry is exactly the part of a URL that goes stale — a
 * region moved in the tree, or a country re-slugged to its ISO code (#556).
 * Ignoring it means an old inbound link still resolves, and the `route` and
 * `canonical` in the answer tell the host the URL it should redirect to.
 * Refusing it would 404 every link into a restructured subtree instead.
 */
export type AtlasRouteTarget = { kind: 'region'; slug: string } | { kind: 'event'; id: number }

/** Decode one segment, tolerating a malformed `%` escape (returns it unchanged). */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * The region/event a route names, or `null` when it names neither — the atlas
 * root (`/`), a bare view route (`/search`), or anything unparseable.
 *
 * `null` is a real answer, not a failure: the host owns the metadata for its own
 * atlas landing page, and there is no document here to describe it with.
 */
export function parseAtlasRoute(route: string): AtlasRouteTarget | null {
  if (typeof route !== 'string' || route.length > MAX_ATLAS_ROUTE_LENGTH) return null
  // A query or fragment is the host page's own, not part of the atlas route — a
  // route carrying one is a caller that spliced its page URL in by mistake.
  // Refuse rather than guess which half was meant.
  if (/[?#\s]/.test(route)) return null

  const segments = route
    .split('/')
    .filter(Boolean)
    .map(safeDecode)
    .filter((segment) => !RESERVED_SEGMENTS.has(segment.toLowerCase()))

  if (segments.length === 0 || segments.length > MAX_ATLAS_ROUTE_SEGMENTS) return null

  const terminal = segments[segments.length - 1]
  if (/^\d+$/.test(terminal)) {
    const id = Number(terminal)
    return id > 0 && id <= MAX_EVENT_ID ? { kind: 'event', id } : null
  }

  // Region slugs are globally unique (`slugField` makes the column unique and
  // indexed, and the Atlas importer disambiguates the handful of colliding
  // names — Georgia the country vs. the US state). So the terminal segment is
  // the whole key, and the segments before it are ancestry we deliberately
  // ignore. See {@link AtlasRouteTarget}.
  return { kind: 'region', slug: terminal }
}
