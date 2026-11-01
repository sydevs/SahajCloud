import type { Endpoint, PayloadRequest } from 'payload'

import type { RoutingMode } from '@/lib/clients/canonical'
import type { SeoCheckResult } from '@/lib/clients/verification'
import {
  nextRoutingProbeState,
  nextSeoCheckState,
  nextVerificationState,
} from '@/lib/clients/verification'
import { notifySeoFailures, runSeoChecksForClient } from '@/lib/embedVerification/seoCheckRun'
import { probeForOutcome, probeRouting, verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import { requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import { getServerUrl } from '@/lib/utilities/serverUrl'
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
  verified: () => 'Verified — the widget is live on that page.',
  failed: (reason) =>
    reason === 'marker-absent'
      ? 'The page loaded but the widget was not running on it.'
      : 'That page could not be reached.',
  inconclusive: (reason) =>
    reason === 'not-configured'
      ? 'Verification is not configured on this environment.'
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
      return Response.json({ errors: [{ message: 'Invalid service id.' }] }, { status: 400 })
    }

    let client: Client
    try {
      client = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      return Response.json({ errors: [{ message: 'Service not found.' }] }, { status: 404 })
    }

    const mount = client.canonical?.embed
    if (!mount) {
      return Response.json(
        { errors: [{ message: 'No canonical embed is selected for this service.' }] },
        { status: 400 },
      )
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
      await notifyNewFailures(req, client, clientId, folded.newFailures)
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

/**
 * Mail the service's manager about failures this run is the first to see.
 *
 * The same recipient rule `VerifyEmbeds` uses for a disabled canonical: the
 * primary contact, falling back to the first listed manager. A service with
 * neither is not mailed, and that is not an error — the tab still shows every
 * failure to whoever opens it.
 */
async function notifyNewFailures(
  req: PayloadRequest,
  client: Client,
  clientId: number,
  failures: readonly SeoCheckResult[],
): Promise<void> {
  if (failures.length === 0) return

  const contactId =
    relationId(client.primaryContact) ??
    (client.managers ?? []).map((manager) => relationId(manager)).find((id) => id !== null)
  if (contactId == null) return

  try {
    const manager = await req.payload.findByID({
      collection: 'managers',
      id: contactId,
      depth: 0,
      overrideAccess: true,
    })
    if (!manager?.email) return

    await notifySeoFailures({
      payload: req.payload,
      clientName: client.name,
      contactEmail: manager.email,
      failures,
      installUrl: `${getServerUrl()}/admin/collections/clients/${clientId}/install`,
    })
  } catch (error) {
    req.payload.logger.error({
      msg: 'verifyEmbedOnDemand: could not resolve a contact for the SEO warning',
      clientId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
