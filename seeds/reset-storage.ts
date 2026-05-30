#!/usr/bin/env tsx

/**
 * Database and Asset Storage Reset Script
 *
 * Resets databases and clears all asset storage for local and/or production environments.
 * Single confirmation at start, then fully automated.
 *
 * Usage:
 *   pnpm reset --local        # Reset local environment only
 *   pnpm reset --production   # Reset production environment only
 *   pnpm reset --all          # Reset both environments (default)
 *   pnpm reset --yes          # Skip confirmation prompt
 *
 * Environment Variables:
 *   CLOUDFLARE_ACCOUNT_ID           - Cloudflare account ID (required for production)
 *   CLOUDFLARE_API_KEY              - Cloudflare API token for Images & Stream
 *   CLOUDFLARE_R2_ACCESS_KEY_ID     - R2 S3 API access key
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY - R2 S3 API secret key
 */

import { execSync } from 'child_process'
import { existsSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import * as readline from 'readline'

import { seedEnv } from './env'
import {
  deleteAllCloudflareImages,
  deleteAllCloudflareVideos,
  countCloudflareImages,
  countCloudflareVideos,
} from './lib/cloudflare-api'
import { createR2Client, deleteAllR2Objects, countR2Objects } from './lib/r2-client'

// Configuration
const LOCAL_DB_PATH = 'local.db'
const WRANGLER_STATE_PATH = '.wrangler/state'
const E2E_DB_PATH = 'tests/.e2e.sqlite'
const PROD_DB_NAME = 'sahajcloud'
const PROD_R2_BUCKET = 'sahajcloud'
const DEV_R2_BUCKET = 'sahajcloud-dev'

// Colors for console output
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

type Environment = 'local' | 'production' | 'all'

interface ResetOptions {
  skipConfirmation: boolean
}

/**
 * Print a colored message
 */
function log(message: string, color = RESET): void {
  console.log(`${color}${message}${RESET}`)
}

/**
 * Print a section header
 */
function logSection(title: string): void {
  console.log(`\n${BLUE}${'='.repeat(60)}${RESET}`)
  console.log(`${BOLD}${title}${RESET}`)
  console.log(`${BLUE}${'='.repeat(60)}${RESET}`)
}

/**
 * Print a step header
 */
function logStep(step: string): void {
  console.log(`\n${CYAN}==> ${step}${RESET}`)
}

/**
 * Prompt for user confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${YELLOW}${message} (yes/no): ${RESET}`, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y')
    })
  })
}

/**
 * Execute a command and return output
 */
function exec(command: string, silent = false): string {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    })
    return output || ''
  } catch (error) {
    if (!silent) {
      throw error
    }
    return ''
  }
}

// =============================================================================
// LOCAL RESET
// =============================================================================

/**
 * Reset local database files
 */
function resetLocalDatabase(): void {
  logStep('Resetting local database')

  const paths = [LOCAL_DB_PATH, WRANGLER_STATE_PATH, E2E_DB_PATH]

  for (const path of paths) {
    const fullPath = resolve(process.cwd(), path)
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true })
      log(`  Deleted: ${path}`, GREEN)
    } else {
      log(`  Not found (skipping): ${path}`, YELLOW)
    }
  }
}

/**
 * Clean local file uploads (media directory)
 */
function resetLocalUploads(): void {
  logStep('Cleaning local file uploads')

  const mediaDir = resolve(process.cwd(), 'media')
  if (existsSync(mediaDir)) {
    rmSync(mediaDir, { recursive: true, force: true })
    log('  Deleted: media/', GREEN)
  } else {
    log('  No media directory found', YELLOW)
  }
}

// =============================================================================
// PRODUCTION RESET
// =============================================================================

/**
 * Get list of tables from D1 database
 *
 * Matches the approach used in reset-migrations.sh:
 * - No --json flag (raw output)
 * - Parse with regex to extract table names
 */
function getD1Tables(): string[] {
  logStep('Fetching table list from production database')

  try {
    const output = execSync(
      `npx wrangler d1 execute ${PROD_DB_NAME} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;"`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    // Extract table names using regex (matches bash: grep -o '"name": "[^"]*"')
    const matches = output.match(/"name":\s*"([^"]+)"/g) || []
    const tables = matches
      .map((match) => {
        const nameMatch = match.match(/"name":\s*"([^"]+)"/)
        return nameMatch?.[1]
      })
      .filter((name): name is string => !!name && name !== 'name')

    log(`  Found ${tables.length} tables`, CYAN)
    return tables
  } catch (error) {
    log(`  Error fetching tables: ${error instanceof Error ? error.message : error}`, RED)
    return []
  }
}

/**
 * Drop all tables in production D1 database
 *
 * Uses --file flag to avoid shell quote escaping issues with table names.
 * Matches the approach used in reset-migrations.sh.
 */
function resetProductionDatabase(): void {
  logStep('Dropping all tables in production database')

  const tables = getD1Tables()

  if (tables.length === 0) {
    log('  No tables to drop', YELLOW)
    return
  }

  // Generate DROP statements and write to temp file (like bash script)
  const dropStatements = ['PRAGMA foreign_keys=OFF;']
  for (const table of tables) {
    dropStatements.push(`DROP TABLE IF EXISTS "${table}";`)
  }
  dropStatements.push('PRAGMA foreign_keys=ON;')

  const tempSqlFile = 'drop_all_tables.sql'
  writeFileSync(tempSqlFile, dropStatements.join('\n'))

  try {
    // Use --file flag to avoid quote escaping issues (matches bash script)
    exec(`npx wrangler d1 execute ${PROD_DB_NAME} --remote --file="${tempSqlFile}"`)
    log(`  Dropped ${tables.length} tables`, GREEN)
  } catch (error) {
    log(`  Error dropping tables: ${error}`, RED)
    throw error
  } finally {
    // Cleanup temp file
    try {
      unlinkSync(tempSqlFile)
    } catch {
      // Ignore cleanup errors
    }
  }

  // Verify tables were actually dropped
  verifyTablesDropped()
}

/**
 * Verify that tables were successfully dropped
 */
function verifyTablesDropped(): void {
  log('  Verifying tables were dropped...', CYAN)

  try {
    const output = execSync(
      `npx wrangler d1 execute ${PROD_DB_NAME} --remote --command "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    const countMatch = output.match(/"count":\s*(\d+)/)
    const remainingTables = countMatch ? parseInt(countMatch[1], 10) : -1

    if (remainingTables === 0) {
      log('  Database is empty', GREEN)
    } else if (remainingTables > 0) {
      log(`  WARNING: ${remainingTables} tables still remain!`, RED)
      throw new Error(`Failed to drop all tables. ${remainingTables} tables remaining.`)
    } else {
      log('  Could not verify table count', YELLOW)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to drop')) {
      throw error
    }
    log(`  Error verifying: ${error instanceof Error ? error.message : error}`, YELLOW)
  }
}

/**
 * Deploy database migrations to production
 */
function deployProductionDatabase(): void {
  logStep('Deploying migrations to production')

  try {
    exec('pnpm run deploy:database')
    log('  Migrations deployed successfully', GREEN)
  } catch (error) {
    log(`  Error deploying migrations: ${error}`, RED)
    throw error
  }
}

/**
 * Verify production database after migration
 */
function verifyProductionDatabase(): void {
  logStep('Verifying production database')

  try {
    // Check payload_migrations table
    log('  Checking payload_migrations table...', CYAN)
    exec(
      `npx wrangler d1 execute ${PROD_DB_NAME} --remote --command "SELECT * FROM payload_migrations;"`,
    )

    // Count tables
    const output = execSync(
      `npx wrangler d1 execute ${PROD_DB_NAME} --remote --command "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    const countMatch = output.match(/"count":\s*(\d+)/)
    const tableCount = countMatch ? countMatch[1] : 'unknown'
    log(`  Tables created: ${tableCount}`, GREEN)
  } catch (error) {
    log(`  Error verifying database: ${error instanceof Error ? error.message : error}`, RED)
  }
}

/**
 * Reset production R2 bucket
 */
async function resetProductionR2(): Promise<void> {
  logStep('Clearing production R2 bucket')

  const accountId = seedEnv.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = seedEnv.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = seedEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    log('  Missing R2 credentials - skipping', YELLOW)
    log(
      '  Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      YELLOW,
    )
    return
  }

  const client = createR2Client({ accountId, accessKeyId, secretAccessKey })

  // Count objects first
  const count = await countR2Objects(client, PROD_R2_BUCKET)
  if (count === 0) {
    log(`  Bucket ${PROD_R2_BUCKET} is already empty`, YELLOW)
    return
  }

  log(`  Found ${count} objects to delete...`, CYAN)

  const deleted = await deleteAllR2Objects(client, PROD_R2_BUCKET, (n, msg) => {
    process.stdout.write(`\r  ${msg}`)
  })

  console.log('') // New line after progress
  log(`  Deleted ${deleted} objects from ${PROD_R2_BUCKET}`, GREEN)
}

/**
 * Reset development R2 bucket
 */
async function resetDevR2(): Promise<void> {
  logStep('Clearing development R2 bucket')

  const accountId = seedEnv.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = seedEnv.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = seedEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    log('  Missing R2 credentials - skipping', YELLOW)
    return
  }

  const client = createR2Client({ accountId, accessKeyId, secretAccessKey })

  try {
    const count = await countR2Objects(client, DEV_R2_BUCKET)
    if (count === 0) {
      log(`  Bucket ${DEV_R2_BUCKET} is already empty`, YELLOW)
      return
    }

    log(`  Found ${count} objects to delete...`, CYAN)

    const deleted = await deleteAllR2Objects(client, DEV_R2_BUCKET, (n, msg) => {
      process.stdout.write(`\r  ${msg}`)
    })

    console.log('')
    log(`  Deleted ${deleted} objects from ${DEV_R2_BUCKET}`, GREEN)
  } catch (_error) {
    // Dev bucket might not exist
    log(`  Bucket ${DEV_R2_BUCKET} not accessible (may not exist)`, YELLOW)
  }
}

/**
 * Reset Cloudflare Images
 */
async function resetCloudflareImages(): Promise<void> {
  logStep('Clearing Cloudflare Images')

  const accountId = seedEnv.CLOUDFLARE_ACCOUNT_ID
  const apiKey = seedEnv.CLOUDFLARE_API_KEY

  if (!accountId || !apiKey) {
    log('  Missing credentials - skipping', YELLOW)
    log('  Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY', YELLOW)
    return
  }

  // Count images first
  const count = await countCloudflareImages(accountId, apiKey)
  if (count === 0) {
    log('  No images to delete', YELLOW)
    return
  }

  log(`  Found ${count} images to delete...`, CYAN)

  const deleted = await deleteAllCloudflareImages(accountId, apiKey, (n, msg) => {
    process.stdout.write(`\r  ${msg}`)
  })

  console.log('')
  log(`  Deleted ${deleted} images`, GREEN)
}

/**
 * Reset Cloudflare Stream
 */
async function resetCloudflareStream(): Promise<void> {
  logStep('Clearing Cloudflare Stream')

  const accountId = seedEnv.CLOUDFLARE_ACCOUNT_ID
  const apiKey = seedEnv.CLOUDFLARE_API_KEY

  if (!accountId || !apiKey) {
    log('  Missing credentials - skipping', YELLOW)
    log('  Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY', YELLOW)
    return
  }

  // Count videos first
  const count = await countCloudflareVideos(accountId, apiKey)
  if (count === 0) {
    log('  No videos to delete', YELLOW)
    return
  }

  log(`  Found ${count} videos to delete...`, CYAN)

  const deleted = await deleteAllCloudflareVideos(accountId, apiKey, (n, msg) => {
    process.stdout.write(`\r  ${msg}`)
  })

  console.log('')
  log(`  Deleted ${deleted} videos`, GREEN)
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Print what will be reset
 */
function printResetSummary(env: Environment): void {
  logSection('RESET SUMMARY')

  if (env === 'local' || env === 'all') {
    console.log(`\n${BOLD}Local Environment:${RESET}`)
    console.log('  - Database: local.db, .wrangler/state/, tests/.e2e.sqlite')
    console.log('  - Uploads: public/{images,meditations,music,files,frames,lessons}/')
  }

  if (env === 'production' || env === 'all') {
    console.log(`\n${BOLD}Production Environment:${RESET}`)
    console.log(`  - D1 Database: ${PROD_DB_NAME} (drop all tables)`)
    console.log(`  - R2 Bucket: ${PROD_R2_BUCKET} (delete all objects)`)
    console.log('  - Cloudflare Images: Delete all images')
    console.log('  - Cloudflare Stream: Delete all videos')
  }

  if (env === 'all') {
    console.log(`\n${BOLD}Development R2:${RESET}`)
    console.log(`  - R2 Bucket: ${DEV_R2_BUCKET} (delete all objects)`)
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): { env: Environment; options: ResetOptions } {
  const args = process.argv.slice(2)

  let env: Environment = 'all'
  const options: ResetOptions = {
    skipConfirmation: false,
  }

  for (const arg of args) {
    switch (arg) {
      case '--local':
        env = 'local'
        break
      case '--production':
      case '--prod':
        env = 'production'
        break
      case '--all':
        env = 'all'
        break
      case '--yes':
      case '-y':
        options.skipConfirmation = true
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
      default:
        log(`Unknown argument: ${arg}`, RED)
        printUsage()
        process.exit(1)
    }
  }

  return { env, options }
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
${BOLD}Database and Asset Storage Reset Script${RESET}

${BOLD}Usage:${RESET}
  pnpm reset                Reset both environments (default)
  pnpm reset --local        Reset local environment only
  pnpm reset --production   Reset production environment only

${BOLD}Options:${RESET}
  --local                         Reset local environment only
  --production, --prod            Reset production environment only
  --all                           Reset both environments (default)
  --yes, -y                       Skip confirmation prompt
  --help, -h                      Show this help message

${BOLD}Environment Variables:${RESET}
  CLOUDFLARE_ACCOUNT_ID           Cloudflare account ID (required for production)
  CLOUDFLARE_API_KEY              Cloudflare API token for Images & Stream
  CLOUDFLARE_R2_ACCESS_KEY_ID     R2 S3 API access key
  CLOUDFLARE_R2_SECRET_ACCESS_KEY R2 S3 API secret key

${BOLD}Examples:${RESET}
  pnpm reset --local              # Reset local database and uploads
  pnpm reset --production --yes   # Reset production without confirmation
  pnpm reset                      # Reset everything (with confirmation)
`)
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { env, options } = parseArgs()

  // Print warning banner
  console.log(`\n${RED}${'╔'.padEnd(62, '═')}╗${RESET}`)
  console.log(
    `${RED}║${RESET}  ${BOLD}${RED}WARNING: This will permanently delete data!${RESET}                  ${RED}║${RESET}`,
  )
  console.log(`${RED}${'╚'.padEnd(62, '═')}╝${RESET}`)

  // Print what will be reset
  printResetSummary(env)

  // Confirm unless --yes flag is provided
  if (!options.skipConfirmation) {
    console.log('')
    const confirmed = await confirm('Are you sure you want to proceed? Type "yes" to confirm')
    if (!confirmed) {
      log('\nAborted.', YELLOW)
      process.exit(0)
    }
  }

  const startTime = Date.now()

  try {
    // Local reset
    if (env === 'local' || env === 'all') {
      logSection('LOCAL ENVIRONMENT RESET')
      resetLocalDatabase()
      resetLocalUploads()
    }

    // Production reset
    if (env === 'production' || env === 'all') {
      logSection('PRODUCTION ENVIRONMENT RESET')

      // Database
      resetProductionDatabase()

      // Deploy migrations
      deployProductionDatabase()

      // Verify database
      verifyProductionDatabase()

      // R2
      await resetProductionR2()

      // Cloudflare Images
      await resetCloudflareImages()

      // Cloudflare Stream
      await resetCloudflareStream()
    }

    // Dev R2 (only on --all)
    if (env === 'all') {
      logSection('DEVELOPMENT R2 CLEANUP')
      await resetDevR2()
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    logSection('COMPLETE')
    log(`\nReset completed in ${elapsed}s`, GREEN)

    // Reminder for next steps
    console.log(`\n${YELLOW}Next steps:${RESET}`)
    if (env === 'local' || env === 'all') {
      console.log('  - Run local migrations: pnpm payload migrate')
    }
    if (env === 'production' || env === 'all') {
      console.log('  - Re-seed production data: pnpm seed')
    }
    console.log('')
  } catch (error) {
    log(`\nReset failed: ${error instanceof Error ? error.message : error}`, RED)
    process.exit(1)
  }
}

main()
