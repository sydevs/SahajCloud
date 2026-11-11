import type { PayloadRequest } from 'payload'

import type { CanonicalVerification } from '@/lib/clients/verification'
import { getPgPool, quotedDbSchema } from '@/plugins/usage'

/**
 * Store one verification pass's outcome, for the nightly job and for a press of
 * Check alike (#1055).
 *
 * ⚠ **Only while the row still holds the state the fold was computed from.**
 * Both writers read `canonical.verification`, spend seconds rendering pages,
 * then write the whole object back — so without the condition a press landing
 * during the nightly run, or the run landing during a press, silently discards
 * the other's attempt and failure count. `IS NOT DISTINCT FROM` is what makes a
 * never-checked service (a NULL column) a condition like any other. A lost race
 * is reported, never retried: the other writer looked at the same page later.
 *
 * ⚠ **Raw SQL on the pool, not `payload.update`.** The usage plugin increments
 * `usage_daily_requests` on these same rows on its own connection, and holding
 * one inside a request transaction is what deadlocked `POST
 * /api/clients/report` (fixed in 1554fcb1). It skips the column's JSON Schema
 * validator, which is safe because the value is `nextVerificationState`'s own
 * output and no caller-supplied shape reaches it.
 */
const updateSql = (quotedSchema: string) => `
  UPDATE ${quotedSchema}.clients
  SET canonical_verification = $1::jsonb,
      canonical_next_verify_at = $2,
      canonical_owned = CASE WHEN $3::boolean THEN false ELSE canonical_owned END
  WHERE id = $4
    AND canonical_verification IS NOT DISTINCT FROM $5::jsonb
`

export async function persistVerification(args: {
  req: PayloadRequest
  clientId: number
  /** The stored verification this outcome was folded from. */
  expect: CanonicalVerification | null | undefined
  verification: CanonicalVerification
  nextVerifyAt: string
  /** Switch canonical ownership off. The job's ladder decides it; a press never does. */
  disable: boolean
}): Promise<boolean> {
  const { req, clientId, expect, verification, nextVerifyAt, disable } = args

  const pool = getPgPool(req)
  if (!pool) throw new Error('persistVerification: Postgres pool unavailable')

  const { rowCount } = await pool.query(updateSql(quotedDbSchema(req)), [
    JSON.stringify(verification),
    nextVerifyAt,
    disable,
    clientId,
    expect == null ? null : JSON.stringify(expect),
  ])
  return rowCount === 1
}
