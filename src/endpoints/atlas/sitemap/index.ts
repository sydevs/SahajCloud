import type { SitemapCandidate } from './sitemapUrls'
import type { AtlasSitemapResponse } from '../../responseTypes'
import type { Endpoint, PayloadRequest, SelectType } from 'payload'

import { APIError } from 'payload'

import { getRegionOwners } from '@/lib/atlas/regionOwners'
import { requireActiveClient } from '@/lib/endpoints'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed } from '@/plugins/usage'

import { ownedRegionIds, sitemapUrls } from './sitemapUrls'

/**
 * The fields one sitemap row is built from. `webPath` / `webUrl` are the same
 * virtual fields `GET /api/atlas/seo` reads its `route` / `canonical` from —
 * reading them here, rather than composing a URL from the owner's domain, is
 * what makes the two byte-identical by construction.
 *
 * A region's pair derives from the document id alone, so nothing extra has to be
 * co-selected. An event's derives from `region` and `_status`, which the
 * `ensureWebPathDeps` beforeOperation hook adds back — `region` is named
 * explicitly anyway, matching the seo endpoint's selects.
 */
const REGION_SELECT: SelectType = { webPath: true, webUrl: true, updatedAt: true }
const EVENT_SELECT: SelectType = { webPath: true, webUrl: true, updatedAt: true, region: true }

/** The standard error envelope, so every refusal here reads the same. */
function errorResponse(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
}

/**
 * Every publishable document in the given regions: the regions themselves, and
 * the classes attached to them.
 *
 * Both reads are unpaginated. The corpus is ~595 regions and ~653 events in
 * total and a client owns a subtree of it, so a page boundary would be a limit
 * invented for its own sake — and a truncated sitemap is worse than a slow one,
 * because nothing in the response would say it had been cut. If it ever needs
 * bounding, a cursor is easier to add than to remove.
 *
 * Both forward the caller's `req` with `overrideAccess: false`, so the client's
 * own access rules apply — published-only, and (on events) the
 * `excludeFinishedEvents` beforeOperation hook drops classes whose schedule has
 * run out, exactly as it does for `GET /api/events/geojson` and for a region
 * page's listing. A finished class stays reachable by direct link, but a sitemap
 * is a list of pages we are asking a crawler to index, and a class that no
 * longer happens is not one of them.
 *
 * ⚠ **The `regions` read is not redundant with the region tree**, though it
 * looks it: resolving ownership has already loaded every region's `pathById`,
 * so a future optimization is bound to notice that the paths are in memory and
 * try to build `loc` as `canonicalUrlBase(owner) + path`. That would make this
 * endpoint the *second* implementation of the URL rule — the exact thing #650
 * exists to prevent — and the byte-identity case in
 * `tests/int/atlas-sitemap.int.spec.ts` is what would catch it. Reading the
 * document's own `webUrl` is the point, and it is also where `updatedAt` (the
 * `lastmod` a consumer cannot derive) comes from.
 */
async function ownedDocuments(
  req: PayloadRequest,
  regionIds: number[],
): Promise<SitemapCandidate[]> {
  const [regions, events] = await Promise.all([
    req.payload.find({
      collection: 'regions',
      where: { id: { in: regionIds } },
      pagination: false,
      depth: 0,
      select: REGION_SELECT,
      overrideAccess: false,
      req,
    }),
    req.payload.find({
      collection: 'events',
      where: { region: { in: regionIds } },
      pagination: false,
      depth: 0,
      select: EVENT_SELECT,
      overrideAccess: false,
      req,
    }),
  ])
  return [...(regions.docs as SitemapCandidate[]), ...(events.docs as SitemapCandidate[])]
}

/**
 * GET /api/atlas/sitemap
 *
 * Every atlas URL the calling client owns, so a consumer can build a sitemap
 * (#650, the last piece of the white-label SEO programme). `GET /api/atlas/seo`
 * answers one route at a time and nothing enumerated the routes, which left both
 * WordPress (C5) and WeMeditateWeb able to render every page's metadata and
 * unable to tell a crawler those pages exist.
 *
 * **Why the consumer must not derive this itself.** The obvious workaround is to
 * read `/api/events/geojson` and `/api/regions` and compose the routes
 * client-side — which would be a second implementation of the URL rule, in PHP,
 * free to disagree with `canonicalUrl.ts` about mount joining, trailing slashes
 * and query-vs-path routing. A sitemap is the one artefact whose whole job is to
 * publish URLs a crawler will fetch, so a disagreement there is a set of 404s
 * submitted to Google on purpose. `loc` is therefore the document's own `webUrl`
 * — the identical field `/seo` returns as `canonical`, read from the identical
 * place — and `tests/int/atlas-sitemap.int.spec.ts` asserts the two agree rather
 * than trusting that they do.
 *
 * **Contract notes a consumer must not guess at:**
 *
 * - **Only what this client owns.** Ownership is per-subtree with the *nearest*
 *   declaring ancestor winning, so a country-level client's sitemap excludes a
 *   city another client owns — those pages are canonically that client's.
 * - **A client that owns nothing gets `{ urls: [] }`, not a 404.** Owning no
 *   subtree is a state, not an error; the count is the signal.
 * - **A document with no publishable canonical is omitted, not sent as `null`.**
 * - **Finished classes are excluded**, matching the map feed and region pages.
 * - **Unpaginated.** See {@link ownedDocuments}.
 * - **`lastmod` is the document's `updatedAt`** — the one field a consumer
 *   genuinely cannot derive.
 *
 * **This answer is per-client**, unlike `/seo`. It is edge-cached on
 * `Vary: Authorization`, which keys a separate cached variant per API key.
 *
 * Registered at the config root rather than on a collection because the answer
 * spans regions *and* events, so no collection owns it — which means the usage
 * plugin's `beforeOperation` gates don't fire for the handler itself and
 * `assertClientOriginAllowed` is called directly (see `.claude/rules/endpoints.md`).
 * The collection reads it forwards *do* run them, so published-only access,
 * project visibility and usage tracking all apply as usual.
 *
 * Returns `AtlasSitemapResponse` (see ./responseTypes).
 */
export const atlasSitemap: Endpoint = {
  path: '/atlas/sitemap',
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

    // `requireActiveClient` has established a `clients` user, whose id is
    // numeric in this database.
    const clientId = req.user?.id as number

    try {
      const regionIds = ownedRegionIds(await getRegionOwners(req), clientId)
      // Nothing owned means nothing to enumerate — and, more usefully, no reads
      // at all: `id: { in: [] }` would be two round trips to learn what the
      // ownership map already said.
      const docs = regionIds.length === 0 ? [] : await ownedDocuments(req, regionIds)

      const body: AtlasSitemapResponse = {
        generated: new Date().toISOString(),
        urls: sitemapUrls(docs),
      }
      return Response.json(body, { headers: publicReadCacheHeaders(req, ['events', 'regions']) })
    } catch (error) {
      // The forwarded reads run the client-query gates, which throw APIError —
      // surface status + message verbatim rather than reporting a server fault.
      if (error instanceof APIError) return errorResponse(error.message, error.status)
      req.payload.logger.error({
        msg: 'atlasSitemap: read failed',
        clientId,
        error: error instanceof Error ? error.message : String(error),
      })
      return errorResponse('Failed to build the sitemap for this client.', 500)
    }
  },
}
