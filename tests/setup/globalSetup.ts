/**
 * Global test setup for SQLite in-memory databases
 *
 * SQLite in-memory databases don't require global setup like MongoDB Memory Server.
 * Each test suite creates its own isolated in-memory database using ':memory:' URL.
 */

export async function setup() {
  console.log('🧪 Test environment: SQLite (in-memory)')
  console.log('   Each test suite will use an isolated in-memory database')
}

export async function teardown() {
  console.log('✅ Test environment cleaned up')
}