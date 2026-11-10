import type { AtlasSitemapResponse } from '../../responseTypes'
import type { Endpoint } from 'payload'

import { readFailureResponse, requireClientAccess, requireIntegerClientId } from '@/lib/endpoints'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { countClientRead } from '@/plugins/usage'

import { resolveAtlasSitemap } from './resolve'

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
 * `requireClientAccess` stands in for them (see `docs/rules/endpoints.md`).
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
    const denied = requireClientAccess(req)
    if (denied) return denied

    // The gate has established a published `clients` user; this is
    // the id that read leaves on the request. Its docblock carries why an
    // unusable one must fail loudly rather than answer "you own nothing".
    const caller = requireIntegerClientId(req, 'Failed to build the sitemap for this client.')
    if (!caller.ok) return caller.response
    const { clientId } = caller

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
      return readFailureResponse(req, error, 'Failed to build the sitemap for this client.', {
        msg: 'atlasSitemap: read failed',
        clientId,
      })
    }
  },
}
