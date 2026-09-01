import type { AtlasRouteTarget } from './atlasRoute'
import type { AtlasSeoBreadcrumb, AtlasSeoEventCard, AtlasSeoResponse } from '../../responseTypes'
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

import { getAtlasLocales } from './atlasLocales'
import { MAX_ATLAS_ROUTE_LENGTH, parseAtlasRoute } from './atlasRoute'
import { buildEventSeo, buildRegionSeo, eventCard, seoImages } from './seoDocument'

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

/**
 * Fields an image needs to render as `og:image` or an `<img>`.
 *
 * `filename` is co-selected because `url` is virtual and reads it — a select
 * naming `url` alone yields `null` and the image silently disappears rather
 * than erroring (see the co-select rule in `src/endpoints/AGENTS.md`).
 */
const IMAGE_SELECT: SelectType = { url: true, alt: true, filename: true }

/** Photos on a class, at most this many, matching the field's own `maxRows`. */
const EVENT_IMAGE_LIMIT = 7

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
      // `null`, not `''`, when the chain has a blank slug and no path can be
      // built — an empty string would render as a link back to the current
      // page. It goes null in exactly the cases `url` does.
      route: pathById.get(ancestorId) ?? null,
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

  const [breadcrumbs, listing, locales] = await Promise.all([
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
    // ^ Finished events drop out of that read without being asked for: the
    // `excludeFinishedEvents` beforeOperation hook ANDs its predicate onto the
    // list read, exactly as it does for `GET /api/events`. A region page
    // listing classes that have already ended would be the one surface
    // contradicting the feed.
    //
    // The enabled languages ride along rather than being awaited afterwards —
    // one more independent read, and the first caller in a request pays a real
    // round trip for it.
    getAtlasLocales(req),
  ])

  const events: AtlasSeoEventCard[] = (listing.docs as Event[]).map((doc) =>
    eventCard(doc, { route: doc.webPath ?? null, url: doc.webUrl ?? null }),
  )

  return buildRegionSeo({
    locales,
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

/**
 * A class's photos, **in the order the editor arranged them**.
 *
 * `images` is an ordered `hasMany` upload field, and the first entry is the lead
 * photo — it becomes `og:image`, which is the one a social card unfurls. A
 * `where: { id: { in: [...] } }` read returns rows in *database* order, so the
 * ids have to be re-applied afterwards; without this an event whose editor put
 * image 42 first would unfurl image 7 simply because 7 sorts lower. (Payload's
 * own `depth: 1` populate preserves the order, which is why reading the images
 * separately — cheaper for the many classes that have none — has to restore it.)
 *
 * Ids with no surviving row (deleted, or not readable by this client) drop out
 * rather than leaving a hole.
 */
async function readImages(req: PayloadRequest, imageIds: number[]): Promise<unknown[]> {
  const { docs } = await req.payload.find({
    collection: 'images',
    where: { id: { in: imageIds } },
    limit: EVENT_IMAGE_LIMIT,
    depth: 0,
    select: IMAGE_SELECT,
    overrideAccess: false,
    req,
  })
  const byId = new Map(docs.map((doc) => [doc.id, doc as unknown]))
  return imageIds.map((id) => byId.get(id)).filter((doc) => doc !== undefined)
}

/** Answer a route that named an event. */
async function eventSeo(
  req: PayloadRequest,
  target: Extract<AtlasRouteTarget, { kind: 'event' }>,
  locale: LocaleCode,
): Promise<AtlasSeoResponse | null> {
  let event: Event
  try {
    // `depth: 0`, so `images` and `region` come back as ids. Letting Payload
    // populate them costs a whole extra `regions` read for a document reduced
    // to an id one line later, and an `images` read for the majority of classes
    // that have no photos — the images are fetched below, only when there are
    // any. `findByID` is exempt from the finished-event list filter, so an old
    // inbound link to a finished class still resolves: the same contract
    // `GET /api/events/{id}` keeps (#603).
    event = (await req.payload.findByID({
      collection: 'events',
      id: target.id,
      depth: 0,
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

  const imageIds = (event.images ?? [])
    .map((image) => relationId(image))
    .filter((id): id is number => id !== null)
    .slice(0, EVENT_IMAGE_LIMIT)

  const regionId = relationId(event.region)
  const route = event.webPath ?? `/${event.id}`

  // Parallelize independent reads: images, breadcrumbs, and locales.
  // Independent reads, so they overlap. Each is skipped entirely when there is
  // nothing to fetch — most classes have no photos, and only a region-less
  // event has no ancestry.
  const [rawImages, breadcrumbs, locales] = await Promise.all([
    imageIds.length === 0 ? Promise.resolve([]) : readImages(req, imageIds),
    regionId === null ? Promise.resolve([]) : regionBreadcrumbs(req, regionId),
    getAtlasLocales(req),
  ])
  const images = seoImages(rawImages)

  return buildEventSeo({
    locales,
    event,
    route,
    canonical: event.webUrl ?? null,
    // The event is the last rung of its own trail; the rungs above it are its
    // region's ancestry.
    breadcrumbs: [...breadcrumbs, { name: event.title, route, url: event.webUrl ?? null }],
    images,
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
 * `assertClientOriginAllowed` is called directly (see `src/endpoints/AGENTS.md`).
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
    const locale: LocaleCode = parsed.data.locale ?? DEFAULT_LOCALE

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
