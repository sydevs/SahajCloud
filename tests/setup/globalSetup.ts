/**
 * Global test setup for the Postgres-backed integration suite.
 *
 * Each test suite creates its own isolated Postgres schema (see
 * `tests/utils/testHelpers.ts`) against DATABASE_URL, so no global DB
 * provisioning is needed here beyond a reachable Postgres instance
 * (Docker locally / a service container in CI).
 */

export async function setup() {
  console.log('🧪 Test environment: Postgres (isolated schema per suite)')
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ?? '(unset)'}`)
}

export async function teardown() {
  console.log('✅ Test environment cleaned up')
}
