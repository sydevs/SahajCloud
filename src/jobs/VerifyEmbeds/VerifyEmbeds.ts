import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import type {
  CanonicalVerification,
  VerificationResult,
} from '@/lib/clients/verification'
import { nextVerificationState } from '@/lib/clients/verification'
import type { RenderDeps } from '@/lib/embedVerification/browserRendering'
import { verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import type { Client } from '@/payload-types'
import { getPgPool, quotedDbSchema } from '@/plugins/usage'

/**
 * Re-verify the embeds that canonical URLs are built from (#633 follow-up).
 *
 * Only a mount the CMS has loaded *itself* and found the widget on may yield a canonical URL, and
 * that fact goes stale: sites are redesigned, pages move, plugins get deactivated. This walks the
 * services that own canonical URLs, re-renders each one, and after three consecutive definitive
 * failures switches the ownership off and tells someone.
 *
 * Three properties worth preserving if this is edited:
 *
 * - **Only `enabled` services are checked.** The work is bounded by the number of canonical
 *   *owners* (at most one per region), not by the client count, so it stays small as the client
 *   base grows.
 * - **`inconclusive` changes nothing.** Our token lapsing or a bot challenge is not evidence about
 *   their embed; it advances the watermark by an hour and leaves the counter and last-good snapshot
 *   alone. `nextVerificationState` owns that rule.
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
type DueClient = Pick<Client, 'id' | 'name' | 'canonical' | 'managers' | 'primaryContact'>

interface VerifyResult {
  /** Due services examined. */
  processed: number
  verified: number
  failed: number
  /** Runs that told us nothing — provider errors, quota, bot challenges. */
  inconclusive: number
  /** Services whose canonical ownership was switched off this run. */
  disabled: number
}

/** Persist one service's outcome. Raw SQL — see the note above. */
const updateSql = (quotedSchema: string) => `
  UPDATE ${quotedSchema}.clients
  SET canonical_verification = $1::jsonb,
      canonical_next_verify_at = $2,
      canonical_enabled = CASE WHEN $3::boolean THEN false ELSE canonical_enabled END
  WHERE id = $4
`

/**
 * Services due for a check.
 *
 * One indexed predicate plus the ownership flag, the same shape `ExpireEvents` uses against
 * `nextCheckAt`. A service that has never been checked has a null watermark, so it is picked up by
 * the `exists: false` arm rather than waiting for a backfill.
 */
async function dueClients(
  payload: Payload,
  req: PayloadRequest,
  now: Date,
): Promise<DueClient[]> {
  const { docs } = await payload.find({
    collection: 'clients',
    where: {
      and: [
        { 'canonical.enabled': { equals: true } },
        {
          or: [
            { 'canonical.nextVerifyAt': { less_than_equal: now.toISOString() } },
            { 'canonical.nextVerifyAt': { exists: false } },
          ],
        },
      ],
    },
    depth: 0,
    select: { name: true, canonical: true, managers: true, primaryContact: true },
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs
}

/** Tell whoever owns the service that its canonical ownership was switched off. */
async function notifyDisabled(
  payload: Payload,
  client: DueClient,
  mount: string,
): Promise<void> {
  const contactId =
    typeof client.primaryContact === 'number'
      ? client.primaryContact
      : typeof client.primaryContact === 'object' && client.primaryContact !== null
        ? client.primaryContact.id
        : (client.managers ?? []).map((m) => (typeof m === 'number' ? m : m?.id)).find(Boolean)

  if (contactId == null) return

  try {
    const manager = await payload.findByID({
      collection: 'managers',
      id: contactId as number,
      depth: 0,
      overrideAccess: true,
    })
    if (!manager?.email) return

    await payload.sendEmail({
      to: manager.email,
      subject: `Canonical URLs switched off for ${client.name}`,
      html:
        `<p>The Sahaj Atlas embed at <code>${mount}</code> failed verification three times in a row, ` +
        `so canonical ownership for <strong>${client.name}</strong> has been switched off.</p>` +
        `<p>Nothing else about the service changed. Once the embed is working again, re-enable ` +
        `canonical ownership in the admin panel and use “Verify now” to confirm it.</p>`,
    })
  } catch (error) {
    // A failed notice must not undo the disable — the disable is the safety action.
    payload.logger.error({
      msg: 'VerifyEmbeds: could not notify about a disabled canonical',
      clientId: client.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Injectable so tests can drive the ladder without a browser or a Cloudflare account. */
export interface VerifyEmbedsDeps extends RenderDeps {
  verify?: (mountKey: string) => Promise<VerificationResult>
}

export async function runVerifyEmbeds(args: {
  payload: Payload
  req: PayloadRequest
  now?: Date
  deps?: VerifyEmbedsDeps
}): Promise<VerifyResult> {
  const { payload, req, now = new Date(), deps = {} } = args
  const verify = deps.verify ?? ((mount: string) => verifyEmbed(mount, deps))

  const result: VerifyResult = {
    processed: 0,
    verified: 0,
    failed: 0,
    inconclusive: 0,
    disabled: 0,
  }

  const pool = getPgPool(req)
  if (!pool) {
    payload.logger.error({ msg: 'VerifyEmbeds: Postgres pool unavailable; skipping run' })
    return result
  }
  const schema = quotedDbSchema(req)

  for (const client of await dueClients(payload, req, now)) {
    const mount = client.canonical?.embed
    if (!mount) continue

    result.processed++
    const outcome = await verify(mount)
    result[outcome.status === 'verified' ? 'verified' : outcome.status]++

    const transition = nextVerificationState({
      current: client.canonical?.verification as CanonicalVerification | null,
      result: outcome,
      now,
    })

    try {
      await pool.query(updateSql(schema), [
        JSON.stringify(transition.verification),
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

    if (transition.disable) {
      result.disabled++
      payload.logger.warn({
        msg: 'VerifyEmbeds: canonical ownership switched off after repeated failures',
        clientId: client.id,
        mount,
      })
      await notifyDisabled(payload, client, mount)
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
  ],
  schedule: [{ cron: '0 3 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    const output = await runVerifyEmbeds({ payload: req.payload, req })
    return { output }
  },
}
