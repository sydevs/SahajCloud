/**
 * Playwright Global Teardown
 *
 * Cleans up E2E test resources after all tests complete.
 * Currently preserves the database for debugging failed tests.
 * Set CLEAN_E2E_DB=true to delete the database after tests.
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
    console.log('   Database preserved at:', E2E_DATABASE_PATH)
    console.log('   Set CLEAN_E2E_DB=true to delete after tests')
  }

  console.log('✅ E2E teardown complete\n')
}

export default globalTeardown
