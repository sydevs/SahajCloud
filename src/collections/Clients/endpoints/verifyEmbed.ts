import type { Endpoint } from 'payload'

import type { RoutingMode } from '@/lib/clients/canonical'
import { primaryPageUrl } from '@/lib/clients/site'
import type { SeoCheckResult } from '@/lib/clients/verification'
import { verifyMount } from '@/lib/embedVerification/seoCheckRun'
import { probeRouting, verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import { errorResponse, requireActiveManager } from '@/lib/endpoints'
import type { Client } from '@/payload-types'

/** `POST /api/clients/:id/verify-embed` response. */
export interface VerifyEmbedResponse {
  status: 'verified' | 'failed' | 'inconclusive'
  reason?: string
  /** Human sentence for the admin panel to render verbatim. */
  message: string
  /** What this service's canonical URLs are shaped like after the check. */
  routing: RoutingMode
  /** Empty until the embed is verified. Every entry is a warning, never a failure. */
  seo: SeoCheckResult[]
}

const MESSAGES: Record<VerifyEmbedResponse['status'], (reason?: string) => string> = {
  verified: () => 'Confirmed — the atlas is live on that page.',
  failed: (reason) =>
    reason === 'marker-absent'
      ? 'The page opened, but the atlas was not running on it.'
      : 'We could not open that page.',
  inconclusive: (reason) =>
    reason === 'not-configured'
      ? 'Checks are not set up on this server.'
      : 'Could not check right now — nothing was changed. Try again shortly.',
}

/**
 * POST /api/clients/:id/verify-embed
 *
 * Run the embed verification for one service on demand, so an operator setting a service up is not
 * waiting for the nightly job to find out whether their choice works. Manager-authenticated: this
 * triggers an outbound page render, so it is not part of the public client surface.
 *
 * Shares `verifyEmbed` and `nextVerificationState` with the job, so a button press and a scheduled
 * run fold into the stored state identically — including the rule that an `inconclusive` result
 * changes nothing. **This endpoint never disables canonical ownership**, though: three strikes is a
 * judgement about a pattern over days, and one impatient click should not be able to reach it.
 *
 * **The routing probe is the opposite case, and its demote does apply here** (#644). Demoting to
 * `query` degrades URLs that keep working, where disabling ownership removes them — so three
 * clicks is an operator's same-minute way back to `?atlas=`, with evidence rather than an
 * assertion. That is why no routing override field exists.
 */
export const verifyEmbedOnDemand: Endpoint = {
  path: '/:id/verify-embed',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const clientId = Number(req.routeParams?.id)
    if (!Number.isInteger(clientId)) {
      return errorResponse('Invalid service id.', 400)
    }

    // ⚠ **`overrideAccess: false`, with the caller's own `req`.**
    // `requireActiveManager` admits any active manager, with no document check,
    // so the row's own read access — the document-manager path
    // (`docs/rules/access.md`) — decides whether this manager may touch this
    // service. A press spends outbound fetches, mails the contact, and can demote
    // the `routingProbe` verdict (#1055); an unlisted manager gets the 404.
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

    const mount = primaryPageUrl(client.site)
    if (!mount) {
      return errorResponse('This service has no atlas address yet.', 400)
    }

    const {
      outcome: result,
      transition,
      verification,
      seo,
    } = await verifyMount({
      req,
      client,
      current: client.canonical?.verification ?? null,
      mount,
      now: new Date(),
      verify: verifyEmbed,
      probe: probeRouting,
      // Wherever the CMS has ever confirmed the widget, not only on this pass.
      runSeo: () => true,
    })

    await req.payload.update({
      collection: 'clients',
      id: clientId,
      // `disable` is deliberately ignored here — see the note above.
      data: {
        canonical: {
          ...client.canonical,
          verification,
          nextVerifyAt: transition.nextVerifyAt,
        },
      },
      overrideAccess: true,
    })

    const reason = result.status === 'verified' ? undefined : result.reason
    const body: VerifyEmbedResponse = {
      status: result.status,
      ...(reason ? { reason } : {}),
      message: MESSAGES[result.status](reason),
      // Answered from the object just written, never re-read through Payload,
      // so the `canonical.routing` hook's default is applied here by hand (#644).
      routing: verification.routingProbe?.verdict ?? 'query',
      seo,
    }
    return Response.json(body, { status: 200 })
  },
}
