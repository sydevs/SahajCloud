/**
 * Usage Plugin DB helpers
 */
import type { PayloadRequest } from 'payload'
import type { Pool } from 'pg'

/**
 * Get the underlying pg Pool from Payload's Postgres adapter.
 *
 * The pool isn't exposed on the public BaseDatabaseAdapter type, so a narrow
 * cast is needed — centralized here so it lives in exactly one place (used by
 * both the usage-tracking hook and the daily-reset task).
 */
export function getPgPool(req: PayloadRequest): Pool | null {
  return (req.payload.db as unknown as { pool?: Pool }).pool ?? null
}
