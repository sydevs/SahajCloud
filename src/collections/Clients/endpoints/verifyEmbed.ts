import type { Endpoint, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { getCanonicalFallbackClientId } from '@/lib/atlas/regionOwners'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { primaryPageUrl, reportedMountsFor, supportsClassAddresses } from '@/lib/clients/site'
import type { SeoCheckResult } from '@/lib/clients/verification'
import { persistVerification } from '@/lib/embedVerification/persistVerification'
import { verifyMount } from '@/lib/embedVerification/seoCheckRun'
import { probeRouting, verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import { errorResponse } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import { loadManagedClient } from './managedClient'

/** Whether this check made the service's site the home for its region's links, and why not. */
export interface ClaimResult {
  status:
    | 'claimed'
    | 'already'
    | 'worldwide'
    | 'no-class-addresses'
    | 'not-claimed'
    | 'taken'
    | 'unknown-mount'
  /** A sentence for the Install tab to render verbatim. */
  message: string
}

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
  /** The region claim this check tried first. */
  claim: ClaimResult
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
 * run see the same page the same way. **A press is never a strike**, though (`countsStrikes:
 * false`): three strikes is a judgement about a pattern over days, so a failed press is logged
 * like an inconclusive one, and this endpoint can neither run the budget down nor disable.
 *
 * **It claims the region first** ({@link claimRegion}), so the SEO checks compare the page against
 * the canonical this service is about to publish rather than the previous owner's.
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
    // A press spends outbound fetches and can demote the `routingProbe`
    // verdict (#1055), so who reaches which service is `loadManagedClient`'s.
    const gate = await loadManagedClient(req)
    if (!gate.ok) return gate.response
    const client = gate.client
    const clientId = client.id

    const mount = primaryPageUrl(client.site)
    if (!mount) {
      return errorResponse('This service has no atlas address yet.', 400)
    }

    const claim = await claimRegion(req, client)

    const current = client.canonical?.verification ?? null
    const {
      outcome: result,
      transition,
      verification,
      seo,
    } = await verifyMount({
      req,
      client,
      current,
      mount,
      now: new Date(),
      verify: verifyEmbed,
      probe: probeRouting,
      // Wherever the CMS has confirmed the widget and this pass did not find it
      // gone — an inconclusive render still has a page worth checking.
      runSeo: (outcome) => outcome.status !== 'failed',
      countsStrikes: false,
    })

    // Only the two keys this owns, and only while the stored verification is
    // still the one the fold above was computed from: the nightly job renders
    // the same page on its own schedule, and whichever of the two finishes
    // second would otherwise discard the other's attempt and failure count
    // (#1116). `disable` is deliberately false here — see the note above.
    const written = await persistVerification({
      req,
      clientId,
      expect: current,
      verification,
      nextVerifyAt: transition.nextVerifyAt,
      disable: false,
    })
    if (!written) {
      req.payload.logger.info({
        msg: 'verify-embed: the nightly run landed during this check; keeping its verdict',
        clientId,
      })
    }

    const reason = result.status === 'verified' ? undefined : result.reason
    const body: VerifyEmbedResponse = {
      status: result.status,
      ...(reason ? { reason } : {}),
      message: MESSAGES[result.status](reason),
      // Answered from this check's own fold, never re-read through Payload, so
      // the `canonical.routing` hook's default is applied here by hand (#644).
      routing: verification.routingProbe?.verdict ?? 'query',
      seo,
      claim,
    }
    return Response.json(body, { status: 200 })
  },
}

/**
 * Make a newly installed service's site the home for its region's atlas links,
 * when nothing else is (#1055) — on every check, so the common case, the first
 * site in its region, needs no decision from anyone.
 *
 * ⚠ **It designates; it does not attest.** Only `verification.verified`, which
 * this same check writes after loading the page itself, yields a public URL
 * (`regionOwners.ts`). The page must be one the widget has reported, and one that
 * can give a class its own link (`supportsClassAddresses`) — a page in a frame
 * owns nothing.
 *
 * The region is an admin's choice (`Clients.region`, write-locked), so a manager
 * claims only the region an admin gave the service. **The uniqueness refusal is
 * `validateCanonicalOwnership`'s**, and its words are passed through; the
 * worldwide case is answered here first, because the hook's words for it are
 * an admin's. The write runs `overrideAccess`, because `canonical.owned` is
 * admin-write-locked: this is the one door a manager has to it.
 */
async function claimRegion(req: PayloadRequest, client: Client): Promise<ClaimResult> {
  if (client.canonical?.owned) {
    return {
      status: 'already',
      message: 'Your site is already the home for its region’s atlas links.',
    }
  }

  // The address is set (the caller refused a service without one), so this is its own domain's.
  const [report] = reportedMountsFor(client.embedMetadata as EmbedMetadata | null, client.site)
  if (!report) {
    return {
      status: 'unknown-mount',
      message: 'We have not seen the atlas on that page yet. Nothing was changed.',
    }
  }

  if (client.site?.track === 'iframe' || !supportsClassAddresses(report.record)) {
    return {
      status: 'no-class-addresses',
      message:
        'This page cannot give each class its own link, so it cannot be the home for its region’s atlas links. Everything else about your install works.',
    }
  }

  if (
    relationId(client.region) == null &&
    (await getCanonicalFallbackClientId(req)) !== client.id
  ) {
    return {
      status: 'worldwide',
      message:
        'Your map shows the whole world, so your site is not the home for any one region’s links.',
    }
  }

  try {
    await req.payload.update({
      collection: 'clients',
      id: client.id,
      data: { canonical: { owned: true } },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error
    // The hook's own sentence names the incumbent; `message` is only Payload's
    // generic "field is invalid" summary.
    const errors = (
      error.data as { errors?: Array<{ message?: string; path?: string }> } | undefined
    )?.errors
    const said = errors?.[0]?.message ?? error.message
    // Only the ownership rule means someone else holds it: a row failing another
    // validator would otherwise send a volunteer to chase a conflict that is not there.
    if (!errors?.some((entry) => entry.path === 'canonical.owned')) {
      return {
        status: 'not-claimed',
        message: `We could not update this service, so nothing was changed. Ask a maintainer to take a look. (${said})`,
      }
    }
    return {
      status: 'taken',
      message: `Another site is already the home for this region’s atlas links, so nothing was changed. Ask a maintainer which site should have them. (${said})`,
    }
  }

  return {
    status: 'claimed',
    message:
      'Your site is now the home for its region’s atlas links, so people looking for classes there will be sent to your pages.',
  }
}
