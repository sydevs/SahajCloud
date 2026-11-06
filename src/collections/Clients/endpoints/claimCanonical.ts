import type { Endpoint } from 'payload'

import { APIError } from 'payload'

import { getCanonicalFallbackClientId } from '@/lib/atlas/regionOwners'
import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { primaryPageUrl, primaryReport, supportsClassAddresses } from '@/lib/clients/site'
import { errorResponse, requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

/** `POST /api/clients/:id/claim-canonical` response. */
export interface ClaimCanonicalResponse {
  status:
    | 'claimed'
    | 'already'
    | 'worldwide'
    | 'no-class-addresses'
    | 'taken'
    | 'unknown-mount'
    | 'no-page'
  /** A sentence for the Install tab to render verbatim. */
  message: string
}

/**
 * POST /api/clients/:id/claim-canonical
 *
 * Make a newly installed service's site the home for its region's atlas links,
 * when nothing else is (#1055). No body: the page is the service's own primary
 * page (`site.domain` + `site.page`), which only its managers set.
 *
 * **Why this exists rather than an admin ticking a box.** The person installing
 * the atlas is one non-technical volunteer per site. The Install tab runs this on
 * every Check, so the common case — the first site in its region — needs no
 * decision from anyone, and every other case is answered in their own words.
 *
 * ⚠ **It designates; it does not attest.** Only `verification.verified`,
 * written by the CMS after it loads the page itself, yields a public URL
 * (`regionOwners.ts`). So the worst this can do is make a service the owner of
 * a region whose page then fails verification and publishes nothing.
 *
 * ⚠ **The page must be one the widget has reported, and one that can give a
 * class its own link** (`supportsClassAddresses`, read from that report). A
 * page in a frame owns nothing, whatever else is true.
 *
 * The region is an admin's choice (`Clients.region`, write-locked), so a
 * manager can claim only the region an admin gave the service. A Worldwide
 * service owns nothing, bar the `sy-atlas-config` fallback, which owns every
 * region no other service does.
 *
 * **The uniqueness refusal is not re-implemented here.**
 * `validateCanonicalOwnership` rejects a second owner of a region and names the
 * incumbent; this passes its words through.
 *
 * Gated on `requireActiveManager` and on the row's own access: the read runs
 * `overrideAccess: false` with the caller's `req`, so the document-manager path
 * decides whether this manager may touch this service. The write then runs
 * with `overrideAccess`, because `canonical.owned` is admin-write-locked — this
 * endpoint is the one door a manager has to it, and it opens only on the rules
 * above.
 */
export const claimCanonical: Endpoint = {
  path: '/:id/claim-canonical',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const clientId = Number(req.routeParams?.id)
    if (!Number.isInteger(clientId)) return errorResponse('Invalid service id.', 400)

    let client: Client
    try {
      client = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
        overrideAccess: false,
        req,
      })
    } catch {
      return errorResponse('Service not found.', 404)
    }

    if (client.canonical?.owned) {
      return answer('already', 'Your site is already the home for its region’s atlas links.')
    }

    if (!primaryPageUrl(client.site)) {
      return answer('no-page', 'Add your atlas address first. Nothing was changed.')
    }

    const report = primaryReport(client.embedMetadata as EmbedMetadata | null, client.site)
    if (!report) {
      return answer(
        'unknown-mount',
        'We have not seen the atlas on that page yet. Nothing was changed.',
      )
    }

    if (client.site?.track === 'iframe' || !supportsClassAddresses(report.record)) {
      return answer(
        'no-class-addresses',
        'This page cannot give each class its own link, so it cannot be the home for its region’s atlas links. Everything else about your install works.',
      )
    }

    if (relationId(client.region) == null) {
      const fallbackId = await getCanonicalFallbackClientId(req)
      if (fallbackId !== clientId) {
        return answer(
          'worldwide',
          'Your map shows the whole world, so your site is not the home for any one region’s links.',
        )
      }
    }

    try {
      await req.payload.update({
        collection: 'clients',
        id: clientId,
        data: { canonical: { ...client.canonical, owned: true } },
        overrideAccess: true,
        req,
      })
    } catch (error) {
      if (error instanceof APIError) {
        // The hook's own sentence names the incumbent; `message` is only
        // Payload's generic "field is invalid" summary.
        const said =
          (error.data as { errors?: Array<{ message?: string }> } | undefined)?.errors?.[0]
            ?.message ?? error.message
        return answer(
          'taken',
          `Another site is already the home for this region’s atlas links, so nothing was changed. Ask a maintainer which site should have them. (${said})`,
        )
      }
      throw error
    }

    return answer(
      'claimed',
      'Your site is now the home for its region’s atlas links, so people looking for classes there will be sent to your pages.',
    )
  },
}

function answer(status: ClaimCanonicalResponse['status'], message: string): Response {
  const body: ClaimCanonicalResponse = { status, message }
  return Response.json(body, { status: 200 })
}
