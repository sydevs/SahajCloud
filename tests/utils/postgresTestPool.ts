/**
 * Shared Postgres pool options for ephemeral test databases.
 *
 * `synchronous_commit=off` skips the per-commit fsync wait — tests do not need
 * durability, and it is a large speed-up for the write-heavy suites on Postgres.
 *
 * Centralised here so the integration-lane helper (`tests/utils/testHelpers.ts`)
 * and the seed-import test config (`seeds/tests/test-payload.config.ts`) stay in
 * sync instead of copy-pasting the magic string (see #499 §6). Keep this module
 * dependency-free — it is imported by configs that run under both Vitest and tsx.
 */
export const TEST_PG_POOL_OPTIONS = '-c synchronous_commit=off'

/**
 * Default Postgres connection string used when DATABASE_URL is unset (for
 * local contributors without an env; CI injects the service-container URL).
 * Single source of truth for the Vitest config's `sharedTestEnv` and the globalSetup
 * orphaned-schema sweep, so they always target the same database.
 */
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/payload_test'
