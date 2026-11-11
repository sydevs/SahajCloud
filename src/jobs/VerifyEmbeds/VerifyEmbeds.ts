import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { APIError } from 'payload'

import { primaryPageUrl } from '@/lib/clients/site'
import type {
  CanonicalVerification,
  RoutingProbeResult,
  VerificationResult,
} from '@/lib/clients/verification'
import type { RenderDeps } from '@/lib/embedVerification/browserRendering'
import { persistVerification } from '@/lib/embedVerification/persistVerification'
import { verifyMount } from '@/lib/embedVerification/seoCheckRun'
import { probeRouting, verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import type { Client, TaskVerifyEmbeds } from '@/payload-types'
import { getPgPool } from '@/plugins/usage'

/**
 * Re-verify the embeds that canonical URLs are built from (#633 follow-up).
 *
 * Only a mount the CMS has loaded *itself* and found the widget on may yield a canonical URL, and
 * that fact goes stale: sites are redesigned, pages move, plugins get deactivated. This walks the
 * services that own canonical URLs, re-renders each one, and after three consecutive definitive
 * failures switches the ownership off.
 *
 * ⚠ **It sends no mail** (#1055). A miss is an open item from the first one —
 * "Map not found", read off `failureCount` and `releasedAt` by
 * `@/lib/atlasOverview/openItems` — in the service managers' "Your websites"
 * digest and an admin's list, beside a failing SEO check.
 *
 * Three properties worth preserving if this is edited:
 *
 * - **Only `enabled` services are checked.** The work is bounded by the number of canonical
 *   *owners* (at most one per region), not by the client count, so it stays small as the client
 *   base grows.
 * - **`inconclusive` changes nothing.** Our token lapsing or a bot challenge is not evidence about
 *   their embed; it advances the watermark by an hour and leaves the counter and last-good snapshot
 *   alone. `nextVerificationState` owns that rule.
 * - **The routing probe never reaches `disable`.** It carries its own counter and its own limit
 *   (#644). A routing negative means the embed is present and publishing in `?atlas=` shape, not
 *   that it is gone, so sharing the failure budget would take a working canonical out of service.
 * - **Writes go through `persistVerification`**, which the Check endpoint shares: raw SQL rather
 *   than `payload.update`, and conditional on the state the fold was computed from, so the two
 *   writers cannot discard each other's attempt and failure count (#1116).
 */

/**
 * A due service, as narrowed by the `select` below.
 *
 * Not `Client` — a selected read returns only what it asked for, and typing it as the full document
 * would let a later edit reach for a field this query never fetched.
 */
type DueClient = Pick<Client, 'id' | 'canonical' | 'site' | 'language'>

/** The task's output, off its `outputSchema` below. */
type VerifyResult = TaskVerifyEmbeds['output']

/**
 * Services due for a check.
 *
 * Every active service with a primary page, not only the ones that own their region: a page
 * that is not running the atlas is worth knowing about whatever it owns. One indexed watermark,
 * the same shape `ExpireEvents` uses against `nextCheckAt`. A service that has never been checked has a null watermark, so it is picked up by
 * the `exists: false` arm rather than waiting for a backfill.
 */
async function dueClients(payload: Payload, req: PayloadRequest, now: Date): Promise<DueClient[]> {
  const { docs } = await payload.find({
    collection: 'clients',
    where: {
      and: [
        { enabled: { equals: true } },
        { 'site.domain': { exists: true } },
        { 'site.page': { exists: true } },
        {
          or: [
            { 'canonical.nextVerifyAt': { less_than_equal: now.toISOString() } },
            { 'canonical.nextVerifyAt': { exists: false } },
          ],
        },
      ],
    },
    depth: 0,
    select: {
      canonical: true,
      site: true,
      // The SEO checks resolve expectations in it.
      language: true,
    },
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs
}

/**
 * Give a recovered site back the region its misses released. Once the page is
 * found again its open item is gone, so nothing would prompt anyone to do this.
 * The ownership hook refuses if another site has taken the region meanwhile,
 * and that is an answer: the region stays with it.
 */
async function reclaimRegion(payload: Payload, id: number): Promise<void> {
  try {
    await payload.update({
      collection: 'clients',
      id,
      data: { canonical: { owned: true } },
      overrideAccess: true,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error
    payload.logger.info({ msg: 'VerifyEmbeds: recovered service did not reclaim', clientId: id })
  }
}

/** Injectable so tests can drive the ladder without a browser or a Cloudflare account. */
export interface VerifyEmbedsDeps extends RenderDeps {
  verify?: (mountKey: string) => Promise<VerificationResult>
  probe?: (mountKey: string) => Promise<RoutingProbeResult>
}

export async function runVerifyEmbeds(args: {
  payload: Payload
  req: PayloadRequest
  now?: Date
  deps?: VerifyEmbedsDeps
}): Promise<VerifyResult> {
  const { payload, req, now = new Date(), deps = {} } = args
  const verify = deps.verify ?? ((mount: string) => verifyEmbed(mount, deps))
  const probe = deps.probe ?? ((mount: string) => probeRouting(mount, deps))

  const result: VerifyResult = {
    processed: 0,
    verified: 0,
    failed: 0,
    inconclusive: 0,
    disabled: 0,
    pathPromoted: 0,
    pathDemoted: 0,
    seoFailing: 0,
  }

  if (!getPgPool(req)) {
    payload.logger.error({ msg: 'VerifyEmbeds: Postgres pool unavailable; skipping run' })
    return result
  }

  for (const client of await dueClients(payload, req, now)) {
    const mount = primaryPageUrl(client.site)
    if (!mount) continue

    result.processed++
    const current = client.canonical?.verification as CanonicalVerification | null
    const { outcome, transition, probeResult, verification, seo } = await verifyMount({
      req,
      client,
      current,
      mount,
      now,
      verify,
      probe,
      // Only where the mount verified on this pass: a site that is down would
      // report four failures caused by the outage.
      runSeo: (result) => result.status === 'verified',
      countsStrikes: true,
    })
    result[outcome.status]++

    let written = false
    try {
      written = await persistVerification({
        req,
        clientId: client.id,
        expect: current,
        verification,
        nextVerifyAt: transition.nextVerifyAt,
        disable: transition.disable,
      })
    } catch (error) {
      payload.logger.error({
        msg: 'VerifyEmbeds: could not persist a verification outcome',
        clientId: client.id,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    // A press of Check wrote its own verdict while this render ran, and that
    // one looked at the page later. Nothing below describes this row any more.
    if (!written) {
      payload.logger.info({
        msg: 'VerifyEmbeds: a Check landed during this render; keeping its verdict',
        clientId: client.id,
      })
      continue
    }

    // The map is back: the region returns to it, as a press of Check would do.
    if (outcome.status === 'verified' && current?.releasedAt) {
      await reclaimRegion(payload, client.id)
    }

    // No mail: the open-items digest reads the snapshot just written.
    if (seo.some((check) => check.status === 'fail')) result.seoFailing++

    // Counted after the write, not before: an owner whose row could not be
    // persisted has not changed its verdict, whatever the fold said.
    // Compared across this job's own raw UPDATE, so neither side has been read
    // back through Payload and the `canonical.routing` default is applied here.
    const before = current?.routingProbe?.verdict ?? 'query'
    const after = verification.routingProbe?.verdict ?? 'query'
    if (before !== after) {
      result[after === 'path' ? 'pathPromoted' : 'pathDemoted']++
      payload.logger.info({
        msg: 'VerifyEmbeds: canonical routing verdict changed',
        clientId: client.id,
        mount,
        from: before,
        to: after,
        // The stored verdict keeps no reason — the log is the only place an
        // operator can see *why* their URLs changed shape.
        reason: probeResult.detail,
      })
    }

    // Every service is checked, but only an owner has anything to lose: the
    // write clears `owned` either way, and only a cleared one is news.
    if (transition.released) {
      result.disabled++
      payload.logger.warn({
        msg: 'VerifyEmbeds: region ownership released after repeated failures',
        clientId: client.id,
        mount,
      })
    }
  }

  return result
}

export const VerifyEmbeds: TaskConfig<'verifyEmbeds'> = {
  slug: 'verifyEmbeds',
  label: 'Verify Canonical Embeds',
  retries: 1,
  concurrency: {
    key: () => 'verifyEmbeds',
    exclusive: true,
  },
  outputSchema: [
    { name: 'processed', type: 'number', required: true },
    { name: 'verified', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
    { name: 'inconclusive', type: 'number', required: true },
    { name: 'disabled', type: 'number', required: true },
    { name: 'pathPromoted', type: 'number', required: true },
    { name: 'pathDemoted', type: 'number', required: true },
    // ⚠ Services whose pages stopped publishing our metadata. Counted apart from
    // `failed`, never added to it: the embed is present and publishing, and
    // `failed` would read as ownership at risk.
    { name: 'seoFailing', type: 'number', required: true },
  ],
  schedule: [{ cron: '0 3 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    const output = await runVerifyEmbeds({ payload: req.payload, req })
    return { output }
  },
}
