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

/**
 * The Postgres schema Payload's adapter is bound to — `public` in prod, an
 * isolated per-suite schema in tests. Raw `pool.query()` runs against the
 * connection's default search_path (public), so table names in raw SQL must be
 * qualified with this schema to resolve under a non-public schema (e.g. tests).
 */
export function getDbSchema(req: PayloadRequest): string {
  return (req.payload.db as unknown as { schemaName?: string }).schemaName || 'public'
}
