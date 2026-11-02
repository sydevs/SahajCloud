/**
 * Shared Postgres pool options for ephemeral test databases.
 *
 * `synchronous_commit=off` skips the per-commit fsync wait — tests do not need
 * durability, and it is a large speed-up for the write-heavy suites on Postgres.
 *
 * Kept beside the default URL below (see #499 §6). Keep this module
 * dependency-free — `vitest.config.mts` imports it.
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
