/**
 * Playwright Global Teardown
 *
 * Cleans up E2E test resources after all tests complete.
 *
 * Note: global-setup now resets the E2E database at the start of each run
 * (to prevent drizzle push prompts from hanging on stale schemas). This
 * teardown is only needed when you additionally want the DB removed after
 * the run — set CLEAN_E2E_DB=true to opt in.
 */
import fs from 'fs'

import type { FullConfig } from '@playwright/test'

import { E2E_DATABASE_PATH } from '../config/e2e-payload.config'

async function globalTeardown(_config: FullConfig) {
  console.log('\n🧹 E2E Test Teardown...')

  // Optionally clean up the database
  // By default, we preserve it for debugging failed tests
  if (process.env.CLEAN_E2E_DB === 'true') {
    if (fs.existsSync(E2E_DATABASE_PATH)) {
      console.log('   Removing E2E database...')
      fs.unlinkSync(E2E_DATABASE_PATH)
    }

    // Also remove SQLite WAL files if they exist
    const walPath = `${E2E_DATABASE_PATH}-wal`
    const shmPath = `${E2E_DATABASE_PATH}-shm`

    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath)
    }
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath)
    }

    console.log('   E2E database cleaned up')
  } else {
    console.log('   Database left in place at:', E2E_DATABASE_PATH)
    console.log('   (It will be reset at the start of the next run.)')
    console.log('   Set CLEAN_E2E_DB=true to also delete it now.')
  }

  console.log('✅ E2E teardown complete\n')
}

export default globalTeardown
