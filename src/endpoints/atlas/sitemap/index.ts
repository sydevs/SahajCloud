import type { AtlasSitemapResponse } from '../../responseTypes'
import type { Endpoint } from 'payload'

import { APIError } from 'payload'

import { requireActiveClient } from '@/lib/endpoints'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { assertClientOriginAllowed, countClientRead } from '@/plugins/usage'

import { resolveAtlasSitemap } from './resolve'

/** The standard error envelope, so every refusal here reads the same. */
function errorResponse(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
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
 * - **One client may additionally be the canonical *fallback*** (#652), named on
 *   `sy-atlas-config`. Its answer is every route no other client owns — the
 *   complement of the ownership map — so that the pages a region declares
 *   nothing for are in somebody's sitemap rather than nobody's. Nothing about
 *   the response shape changes, and no other client's answer is affected.
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
 * `assertClientOriginAllowed` is called directly (see `docs/rules/endpoints.md`).
 * The collection reads it forwards *do* run them, so published-only access and
 * project visibility apply as usual, and the meter is idempotent per request, so
 * they add nothing to the one count (#891).
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

    // `requireActiveClient` has established a published `clients` user. Payload
    // types `id` as `string | number` (its Mongo adapter uses strings) while
    // this database is Postgres, so this converts rather than asserting:
    // `CanonicalOwner.clientId` is a number, and `'7' === 7` is false, so a
    // string id would match no owner and answer "you own nothing".
    //
    // That answer is **indistinguishable from the legitimate empty one** — a
    // client that owns no subtree gets `urls: []` by design — so an unusable id
    // has to fail loudly. A consumer told it owns nothing publishes an empty
    // sitemap, which is how a site asks to be de-indexed.
    const clientId = Number(req.user?.id)
    if (!Number.isInteger(clientId)) {
      req.payload.logger.error({
        msg: 'atlasSitemap: client id is not an integer',
        clientId: req.user?.id,
      })
      return errorResponse('Failed to build the sitemap for this client.', 500)
    }

    // A root endpoint runs no collection `beforeOperation` hook, so it counts
    // itself (#891). The reads below happen to count it too — the region tree is
    // read on every call — so this is the floor rather than the only count, and
    // it is what keeps the route at 1 if that ever stops being true. Idempotent,
    // so the pair never costs two.
    await countClientRead(req)

    try {
      const body: AtlasSitemapResponse = {
        generated: new Date().toISOString(),
        urls: (await resolveAtlasSitemap({ req, clientId })).urls,
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
