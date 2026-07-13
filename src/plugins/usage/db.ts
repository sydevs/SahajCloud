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

/**
 * Validate a Postgres schema identifier before interpolating into raw SQL.
 *
 * INVARIANT: The schema is derived from Payload's database adapter config,
 * not user input. It is either 'public' (production/development) or a test
 * schema name (isolation). This function validates against a static allowlist
 * to prevent SQL injection if the schema value ever becomes dynamic.
 *
 * If a new schema name is needed, add it to ALLOWED_SCHEMAS below.
 */
const ALLOWED_SCHEMAS = new Set(['public'])

export function validateSchemaIdentifier(schema: string): void {
  // Check against allowlist
  if (ALLOWED_SCHEMAS.has(schema)) {
    return
  }

  // Permit test schemas that match the pattern test_<identifier>
  // This allows test isolation schemas created by the Drizzle adapter
  if (/^test_[a-z0-9_]+$/i.test(schema)) {
    return
  }

  throw new Error(
    `Invalid schema identifier: ${schema}. ` +
      `Only 'public' and test_* schemas are allowed. ` +
      `If a new schema is needed, add it to ALLOWED_SCHEMAS in db.ts`,
  )
}
