import type { Endpoint } from 'payload'

import type { RoutingMode } from '@/lib/clients/canonical'
import { primaryPageUrl } from '@/lib/clients/site'
import type { SeoCheckResult } from '@/lib/clients/verification'
import {
  nextRoutingProbeState,
  nextSeoCheckState,
  nextVerificationState,
} from '@/lib/clients/verification'
import { notifySeoFailures, runSeoChecksForClient } from '@/lib/embedVerification/seoCheckRun'
import { probeForOutcome, probeRouting, verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import { errorResponse, requireActiveManager } from '@/lib/endpoints'
import type { Client } from '@/payload-types'

/** `POST /api/clients/:id/verify-embed` response. */
interface VerifyEmbedResponse {
  status: 'verified' | 'failed' | 'inconclusive'
  reason?: string
  /** Human sentence for the admin panel to render verbatim. */
  message: string
  /** What this service's canonical URLs are shaped like after the check. */
  routing: RoutingMode
  /**
   * What a crawler can see on the pages this service publishes.
   *
   * Empty when the embed is not verified — there is no page to check yet — and
   * every entry is a warning rather than a failure. The tab renders each one
   * beside the step it confirms.
   */
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
    // `requireActiveManager` admits any manager whose `type` is not `inactive`
    // — no role, no document check — and its own docblock says a caller must
    // still scope the write rather than taking an arbitrary id. This handler
    // takes the id from the route, so the row's own read access is what decides
    // whether this manager may touch this service: for `clients` that is the
    // document-manager path (`docs/rules/access.md`), and a manager who is not
    // listed gets the 404 below.
    //
    // It matters more since #1055: this endpoint now also spends outbound
    // fetches against the service's site and mails its primary contact, and it
    // could already demote a stranger's `routingProbe` verdict — which changes
    // live public URL shapes — three presses running.
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

    const now = new Date()
    const result = await verifyEmbed(mount)
    const transition = nextVerificationState({
      current: client.canonical?.verification ?? null,
      result,
      now,
    })

    // `probeForOutcome` is the job's gate, shared rather than restated, so a
    // button press and a scheduled run spend the same renders.
    const verification = nextRoutingProbeState({
      current: transition.verification,
      result: await probeForOutcome(mount, result, probeRouting),
      now,
    })

    // The SEO checks run only on a verified embed: they compare what a crawler
    // sees against what the endpoint answered, and there is nothing to compare
    // until the CMS has confirmed the page carries the widget at all.
    let seo: SeoCheckResult[] = []
    let withSeo = verification
    if (verification.verified) {
      seo = await runSeoChecksForClient({
        req,
        clientId,
        verified: verification.verified,
        routing: verification.routingProbe?.verdict ?? 'query',
        language: client.language,
      })
      const folded = nextSeoCheckState({ current: verification, results: seo, now })
      withSeo = folded.verification
      await notifySeoFailures({ payload: req.payload, client, failures: folded.newFailures })
    }

    await req.payload.update({
      collection: 'clients',
      id: clientId,
      // `disable` is deliberately ignored here — see the note above.
      data: {
        canonical: {
          ...client.canonical,
          verification: withSeo,
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
