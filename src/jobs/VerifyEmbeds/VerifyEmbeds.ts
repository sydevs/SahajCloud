import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { primaryPageUrl } from '@/lib/clients/site'
import type {
  CanonicalVerification,
  RoutingProbeResult,
  VerificationResult,
} from '@/lib/clients/verification'
import type { RenderDeps } from '@/lib/embedVerification/browserRendering'
import { verifyMount } from '@/lib/embedVerification/seoCheckRun'
import { probeRouting, verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import type { Client, TaskVerifyEmbeds } from '@/payload-types'
import { getPgPool, quotedDbSchema } from '@/plugins/usage'

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
 * - **Writes go through raw SQL, not `payload.update`.** The usage plugin increments
 *   `usage_daily_requests` on these same rows on its own connection; holding one inside a request
 *   transaction is what deadlocked `POST /api/clients/report` (fixed in 1554fcb1).
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

/** Persist one service's outcome. Raw SQL — see the note above. */
const updateSql = (quotedSchema: string) => `
  UPDATE ${quotedSchema}.clients
  SET canonical_verification = $1::jsonb,
      canonical_next_verify_at = $2,
      canonical_owned = CASE WHEN $3::boolean THEN false ELSE canonical_owned END
  WHERE id = $4
`

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

  const pool = getPgPool(req)
  if (!pool) {
    payload.logger.error({ msg: 'VerifyEmbeds: Postgres pool unavailable; skipping run' })
    return result
  }
  const schema = quotedDbSchema(req)

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

    try {
      await pool.query(updateSql(schema), [
        JSON.stringify(verification),
        transition.nextVerifyAt,
        transition.disable,
        client.id,
      ])
    } catch (error) {
      payload.logger.error({
        msg: 'VerifyEmbeds: could not persist a verification outcome',
        clientId: client.id,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
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
