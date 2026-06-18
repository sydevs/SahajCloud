/**
 * Shared Postgres pool options for ephemeral test databases.
 *
 * `synchronous_commit=off` skips the per-commit fsync wait — tests don't need
 * durability, and it's a large speed-up for the write-heavy suites on Postgres.
 *
 * Centralised here so the integration-lane helper (`tests/utils/testHelpers.ts`)
 * and the seed-import test config (`seeds/tests/test-payload.config.ts`) stay in
 * sync instead of copy-pasting the magic string (see #499 §6). Keep this module
 * dependency-free — it's imported by configs that run under both Vitest and tsx.
 */
export const TEST_PG_POOL_OPTIONS = '-c synchronous_commit=off'
