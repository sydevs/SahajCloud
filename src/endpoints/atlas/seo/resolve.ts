import type { AtlasRouteTarget } from './atlasRoute'
import type { AtlasSeoBreadcrumb, AtlasSeoEventCard } from '../../responseTypes'
import type { PayloadRequest, SelectType } from 'payload'

import { APIError } from 'payload'

import { canonicalMountUrl } from '@/lib/atlas/canonicalUrl'
import {
  canonicalOwnerForClient,
  canonicalTargetFor,
  getCanonicalUrlForRegion,
} from '@/lib/atlas/regionOwners'
import { descendantRegionIds, getRegionTree } from '@/lib/atlas/regionTree'
import type { LocaleCode } from '@/lib/locales'
import { EVENT_IMAGE_LIMIT, readEventImages } from '@/lib/utilities/eventImages'
import { relationId } from '@/lib/utilities/relationId'
import type { Event, Region } from '@/payload-types'

import { getAtlasLocales } from './atlasLocales'
import { getRootSeoStrings } from './rootStrings'
import {
  type AtlasSeoDocument,
  buildEventSeo,
  buildRegionSeo,
  buildRootSeo,
  eventCard,
  seoImages,
} from './seoDocument'

/**
 * Resolve one atlas route into the SEO document that describes it — the one
 * resolution `GET /api/atlas/seo` and `GET /api/atlas/wix/route` (#1055) both
 * serialize, so no host's `<title>` and canonical describe different documents.
 *
 * Every read forwards the caller's `req` with `overrideAccess: false`, so
 * published-only access and project visibility apply.
 */

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
 * Fields a listing card needs. `region` and `_status` back `webPath` /
 * `webUrl`; the `ensureVirtualFieldDeps` beforeOperation hook keeps them present
 * even when a caller selects the URL fields without them.
 */
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

/** An event's own page: the card plus what only that page renders. */
const EVENT_SELECT: SelectType = {
  ...EVENT_CARD_SELECT,
  languages: true,
  description: true,
  website: true,
  images: true,
  onlineUrl: true,
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

/**
 * Answer the atlas root — `/`, and every bare view route (#739). Its copy is the
 * operator's, from `sy-atlas-translations` (see `./rootStrings`).
 *
 * Its canonical is **the caller's own mount page**.
 *
 * Every other route resolves its canonical through region ownership, because
 * the document decides who speaks for it. The root names no document, so the
 * only page it can describe is the one asking — the host that mounted the
 * widget and is rendering its landing page right now. That page's address is
 * already on the caller's `clients` record, put there by the verification job,
 * and `canonicalOwnerForClient` is the one definition of when we will publish
 * it: eligible (canonically enabled, published) and a host we are willing to
 * name. Trusting `req.user` instead would make a `canonical` group that auth
 * happens not to attach read as "owns nothing", published, with nothing
 * failing.
 *
 * Falling through to the We Meditate surface is deliberate, and is **not** the
 * region path's fallback chain: the #652 fallback client speaks for regions
 * nobody claims, and somebody else's landing page is not one of those. A host
 * that cannot publish a canonical of its own gets the surface that indexes the
 * atlas, never another client's page.
 */
async function rootSeo(req: PayloadRequest, locale: LocaleCode): Promise<AtlasSeoDocument> {
  // Three independent reads — the copy, the enabled locales, the caller's own
  // record — so they overlap rather than queue.
  const [strings, locales, owner] = await Promise.all([
    getRootSeoStrings(req, locale),
    getAtlasLocales(req),
    canonicalOwnerForClient(req, req.user?.id),
  ])
  const canonical = canonicalMountUrl(canonicalTargetFor(owner))

  return buildRootSeo({ ...strings, canonical, locale, locales })
}

/** Answer a route that named a region. */
async function regionSeo(
  req: PayloadRequest,
  target: Extract<AtlasRouteTarget, { kind: 'region' }>,
  locale: LocaleCode,
): Promise<AtlasSeoDocument | null> {
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

/** Answer a route that named an event. */
async function eventSeo(
  req: PayloadRequest,
  target: Extract<AtlasRouteTarget, { kind: 'event' }>,
  locale: LocaleCode,
): Promise<AtlasSeoDocument | null> {
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

  // Independent reads, so they overlap. Each is skipped entirely when there is
  // nothing to fetch — most classes have no photos, and only a region-less
  // event has no ancestry.
  const [rawImages, breadcrumbs, locales] = await Promise.all([
    imageIds.length === 0
      ? Promise.resolve([])
      : readEventImages(imageIds, { payload: req.payload, overrideAccess: false, req }),
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
 * The resolution of one parsed route, or `null` when it names a region or event
 * that does not exist.
 */
export async function resolveAtlasSeo(args: {
  req: PayloadRequest
  target: AtlasRouteTarget
  locale: LocaleCode
}): Promise<AtlasSeoDocument | null> {
  const { req, target, locale } = args
  // ⚠ **The root is the one route whose answer depends on who asked** (#739):
  // a caller resolving it for another client puts that client on `req.user`.
  if (target.kind === 'root') return rootSeo(req, locale)
  if (target.kind === 'region') return regionSeo(req, target, locale)
  return eventSeo(req, target, locale)
}
