/**
 * Global test setup for the Postgres-backed integration suite.
 *
 * Each test suite creates its own isolated Postgres schema (see
 * `tests/utils/testHelpers.ts`) against DATABASE_URL, so no global DB
 * provisioning is needed here beyond a reachable Postgres instance
 * (Docker locally / a service container in CI).
 *
 * It does, however, sweep orphaned per-suite schemas before the lane starts —
 * see `sweepOrphanedTestSchemas` (#499 §7).
 */
import { Client } from 'pg'

import { DEFAULT_TEST_DATABASE_URL } from '../utils/postgresTestPool'

/**
 * Matches the schema names minted by `makeTestSchemaName()` in testHelpers
 * (`test_<base36>_<base36>`). Deliberately strict — the sweep below DROPs every
 * match with CASCADE, so it must never match a real schema (`public`,
 * `seed_test`, `e2e`, …). Same string is used as a Postgres regex and a JS regex.
 */
export const GENERATED_TEST_SCHEMA_PATTERN = '^test_[0-9a-z]+_[0-9a-z]+$'
const GENERATED_TEST_SCHEMA_REGEX = new RegExp(GENERATED_TEST_SCHEMA_PATTERN)

/** True if `name` was minted by the per-suite schema generator (safe to drop). */
export function isGeneratedTestSchema(name: string): boolean {
  return GENERATED_TEST_SCHEMA_REGEX.test(name)
}

/**
 * Per-suite schemas are dropped on cleanup, but a crashed or killed run leaks
 * them, and against a shared dev Postgres they accumulate indefinitely. Drop any
 * leftovers once, before the lane starts. Best-effort: a failure here must not
 * block the suite — the lane still creates its own fresh schemas regardless.
 */
async function sweepOrphanedTestSchemas(connectionString: string): Promise<void> {
  const client = new Client({ connectionString })
  try {
    await client.connect()
    const { rows } = await client.query<{ schema_name: string }>(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name ~ $1',
      [GENERATED_TEST_SCHEMA_PATTERN],
    )
    for (const { schema_name } of rows) {
      // schema_name is matched against GENERATED_TEST_SCHEMA_PATTERN by the
      // query (only [0-9a-z_] in fixed positions), so interpolating it is
      // injection-safe. Identifiers cannot be parameterized in DDL anyway.
      await client.query(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`)
    }
    if (rows.length > 0) {
      console.log(`   Swept ${rows.length} orphaned test_% schema(s)`)
    }
  } catch (error) {
    console.warn(`   ⚠️  Orphaned-schema sweep skipped: ${(error as Error).message}`)
  } finally {
    await client.end().catch(() => {}) // ignore close errors (best-effort cleanup)
  }
}

export async function setup() {
  // Mirror the DATABASE_URL resolution in vitest.config.mts's sharedTestEnv so the
  // sweep targets the same Postgres the suite workers connect to.
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL
  console.log('🧪 Test environment: Postgres (isolated schema per suite)')
  console.log(`   DATABASE_URL: ${databaseUrl}`)
  await sweepOrphanedTestSchemas(databaseUrl)
}

export async function teardown() {
  console.log('✅ Test environment cleaned up')
}
