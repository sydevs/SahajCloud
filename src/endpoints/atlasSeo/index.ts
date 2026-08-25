import type { AtlasSeoBreadcrumb, AtlasSeoEventCard, AtlasSeoResponse } from '../responseTypes'
import type { AtlasRouteTarget } from './atlasRoute'
import type { Endpoint, PayloadRequest, SelectType } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { getCanonicalUrlForRegion } from '@/lib/atlas/regionOwners'
import { descendantRegionIds, getRegionTree } from '@/lib/atlas/regionTree'
import { parseQuery, requireActiveClient } from '@/lib/endpoints'
import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE, isValidLocale, LOCALES } from '@/lib/locales'
import { relationId } from '@/lib/utilities/relationId'
import type { Event, Region } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed } from '@/plugins/usage'

import { MAX_ATLAS_ROUTE_LENGTH, parseAtlasRoute } from './atlasRoute'
import { buildEventSeo, buildRegionSeo, eventCard } from './seoDocument'

/**
 * How many classes a region's listing carries.
 *
 * A region page exists to be indexable, and a bounded list of its classes is
 * what makes it worth indexing — but a country resolves to every class beneath
 * it, and a `<head>` request should not become an unbounded feed. `eventCount`
 * always reports the true total, so a consumer can tell a full list from a
 * capped one instead of silently rendering a partial page as a complete one.
 */
const REGION_EVENT_LIMIT = 50

/**
 * Fields a region's own read needs. `webPath` / `webUrl` are virtual and derive
 * from the document id alone, so nothing extra has to be co-selected for them.
 */
const REGION_SELECT: SelectType = {
  name: true,
  subtitle: true,
  level: true,
  webPath: true,
  webUrl: true,
}

/**
 * Fields an event's own read needs. `region` and `_status` back `webPath` /
 * `webUrl`; the `ensureWebPathDeps` beforeOperation hook keeps them present
 * even when a caller selects the URL fields without them.
 */
const EVENT_SELECT: SelectType = {
  title: true,
  languages: true,
  description: true,
  website: true,
  images: true,
  eventType: true,
  onlineUrl: true,
  address: true,
  inactive: true,
  schedule: true,
  region: true,
  webPath: true,
  webUrl: true,
}

/** The subset of the above a listing card needs — no description, no images. */
const EVENT_CARD_SELECT: SelectType = {
  title: true,
  eventType: true,
  address: true,
  inactive: true,
  schedule: true,
  region: true,
  webPath: true,
  webUrl: true,
}

const querySchema = z.object({
  route: z.string().min(1).max(MAX_ATLAS_ROUTE_LENGTH),
  locale: z
    .string()
    .max(20)
    .optional()
    .refine((value) => value === undefined || isValidLocale(value), {
      message: `Unknown locale. Expected one of: ${LOCALES.map((locale) => locale.code).join(', ')}.`,
    }),
})

/** The standard error envelope, so every refusal here reads the same. */
function errorResponse(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
}

/**
 * The region ancestry as breadcrumb rungs, root first.
 *
 * Each rung resolves **its own** canonical URL rather than reusing the terminal
 * document's base: ownership is per-subtree, so `/gb` and `/gb/greater-london`
 * legitimately live on different domains. Both halves are per-request memoized
 * maps, so this costs no additional query however deep the chain.
 */
async function regionBreadcrumbs(
  req: PayloadRequest,
  regionId: number,
): Promise<AtlasSeoBreadcrumb[]> {
  const { chainById, pathById, nameById } = await getRegionTree(req)
  const chain = chainById.get(regionId) ?? [regionId]
  return Promise.all(
    chain.map(async (ancestorId) => ({
      name: nameById.get(ancestorId) ?? '',
      route: pathById.get(ancestorId) ?? '',
      url: await getCanonicalUrlForRegion(req, ancestorId),
    })),
  )
}

/** Answer a route that named a region. */
async function regionSeo(
  req: PayloadRequest,
  target: Extract<AtlasRouteTarget, { kind: 'region' }>,
  locale: LocaleCode,
): Promise<AtlasSeoResponse | null> {
  // Keyed on the globally-unique slug, which is one indexed equality.
  //
  // ⚠ **Not** `where['breadcrumbs.url'][equals]`, despite #640 having shipped
  // `generateURL` to enable exactly that. `breadcrumbs` is an *array*, and
  // Payload's `equals` on an array sub-field matches when **any** element
  // matches — so `/gb/london` matches every descendant of London as well as
  // London itself, and the row you get back is whichever the database returned
  // first. `tests/int/atlas-seo.int.spec.ts` caught this resolving a city route
  // to a venue two levels down. The stored `breadcrumbs.url` is still the right
  // denormalization; it is just not a unique key, and the slug already is.
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { slug: { equals: target.slug } },
    limit: 1,
    depth: 0,
    select: REGION_SELECT,
    locale,
    overrideAccess: false,
    req,
  })
  const region = docs[0] as Region | undefined
  if (!region) return null

  const { chainById } = await getRegionTree(req)
  // Events attach to a city **or** to a shared venue beneath it, so a city's
  // page lists its whole subtree — otherwise every class held at a shared venue
  // would be invisible on the page a seeker actually lands on.
  const regionIds = descendantRegionIds(chainById, region.id)

  const [breadcrumbs, listing] = await Promise.all([
    regionBreadcrumbs(req, region.id),
    req.payload.find({
      collection: 'events',
      where: { region: { in: regionIds } },
      limit: REGION_EVENT_LIMIT,
      // Stable ordering, so the same region yields a byte-identical body on
      // every request and the edge cache is worth having.
      sort: 'title',
      depth: 0,
      select: EVENT_CARD_SELECT,
      locale,
      overrideAccess: false,
      req,
    }),
    // Finished events drop out here without being asked for: the
    // `excludeFinishedEvents` beforeOperation hook ANDs its predicate onto this
    // list read, exactly as it does for `GET /api/events`. A region page
    // listing classes that have already ended would be the one surface
    // contradicting the feed.
  ])

  const events: AtlasSeoEventCard[] = (listing.docs as Event[]).map((doc) =>
    eventCard(doc, { route: doc.webPath ?? null, url: doc.webUrl ?? null }),
  )

  return buildRegionSeo({
    id: region.id,
    name: region.name ?? '',
    subtitle: region.subtitle ?? null,
    level: region.level,
    // The document's own path, not the caller's string: a legacy or stale
    // prefix resolves here and is answered with the route it should have used.
    route: region.webPath ?? `/${target.slug}`,
    canonical: region.webUrl ?? null,
    breadcrumbs,
    events,
    eventCount: listing.totalDocs,
    locale,
  })
}

/** Answer a route that named an event. */
async function eventSeo(
  req: PayloadRequest,
  target: Extract<AtlasRouteTarget, { kind: 'event' }>,
  locale: LocaleCode,
): Promise<AtlasSeoResponse | null> {
  let event: Event
  try {
    // `depth: 1` populates `images` so `og:image` and the rendered children can
    // name a real file. `findByID` is exempt from the finished-event list
    // filter, so an old inbound link to a finished class still resolves — the
    // same contract `GET /api/events/{id}` keeps (#603).
    event = (await req.payload.findByID({
      collection: 'events',
      id: target.id,
      depth: 1,
      select: EVENT_SELECT,
      locale,
      overrideAccess: false,
      req,
    })) as Event
  } catch (error) {
    // A missing, unpublished or invisible event is "no such route" — the same
    // answer a bad slug gets, and never a 500.
    if (error instanceof APIError && error.status === 404) return null
    throw error
  }

  const regionId = relationId(event.region)
  const route = event.webPath ?? `/${event.id}`
  const breadcrumbs = regionId === null ? [] : await regionBreadcrumbs(req, regionId)

  return buildEventSeo({
    event,
    route,
    canonical: event.webUrl ?? null,
    // The event is the last rung of its own trail; the rungs above it are its
    // region's ancestry.
    breadcrumbs: [...breadcrumbs, { name: event.title, route, url: event.webUrl ?? null }],
    locale,
  })
}

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
 * - A route naming neither a region nor an event — the atlas root, a bare
 *   `/search` — is a **404**. The host owns its own landing page's metadata;
 *   there is no document here to describe it with.
 *
 * Registered at the config root rather than on a collection because the route
 * may name a region *or* an event, so no collection owns it — which means the
 * usage plugin's `beforeOperation` gates don't fire for the handler itself and
 * `assertClientOriginAllowed` is called directly (see `.claude/rules/endpoints.md`).
 * The collection reads it forwards *do* run them, so published-only access,
 * project visibility and usage tracking all apply as usual.
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
    const requested = parsed.data.locale
    const locale: LocaleCode =
      requested !== undefined && isValidLocale(requested) ? requested : DEFAULT_LOCALE

    const target = parseAtlasRoute(parsed.data.route)
    if (!target) return errorResponse('That route does not name a region or an event.', 404)

    try {
      const seo =
        target.kind === 'region'
          ? await regionSeo(req, target, locale)
          : await eventSeo(req, target, locale)
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
