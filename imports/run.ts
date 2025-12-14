#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Unified Seed Script Runner
 *
 * A CLI that triggers seed scripts via the API endpoint with SSE progress streaming.
 * Can be used to seed both local development and production environments.
 *
 * Usage:
 *   pnpm seed [script...] [options]
 *
 * If no script is specified, runs ALL scripts in dependency order:
 *   tags → wemeditate → storyblok → meditations
 *
 * Scripts:
 *   storyblok    - Seed Path Steps from Storyblok CMS
 *   wemeditate   - Seed content from WeMeditate Rails database
 *   meditations  - Seed meditation content from legacy database
 *   tags         - Seed MeditationTags and MusicTags from Cloudinary
 *
 * Options:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 *
 * Environment Variables:
 *   SAHAJCLOUD_URL  - Target URL (default: http://localhost:PORT)
 *   ADMIN_EMAIL     - Admin email for authentication
 *   ADMIN_PASSWORD  - Admin password for authentication
 *   PORT            - Local dev server port (default: 3000)
 *
 * Examples:
 *   pnpm seed                           # Run all scripts in order
 *   pnpm seed --dry-run                 # Dry run all scripts
 *   pnpm seed storyblok --dry-run       # Run single script
 *   pnpm seed tags wemeditate           # Run multiple scripts
 *   pnpm seed wemeditate --clear-cache
 *
 *   # Seed production
 *   SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed
 */

import 'dotenv/config'

type ScriptName = 'storyblok' | 'wemeditate' | 'meditations' | 'tags'

const VALID_SCRIPTS: ScriptName[] = ['storyblok', 'wemeditate', 'meditations', 'tags']

// Dependency order: tags first (referenced by other content), then wemeditate (authors/categories),
// then storyblok (lessons), finally meditations (may reference tags, narrators, etc.)
const SCRIPT_RUN_ORDER: ScriptName[] = ['tags', 'wemeditate', 'storyblok', 'meditations']

const SCRIPT_DESCRIPTIONS: Record<ScriptName, string> = {
  storyblok: 'Seed Path Steps from Storyblok CMS',
  wemeditate: 'Seed content from WeMeditate Rails database',
  meditations: 'Seed meditation content from legacy database',
  tags: 'Seed MeditationTags and MusicTags from Cloudinary',
}

const VALID_OPTIONS = ['--dry-run', '--clear-cache']

function printUsage(): void {
  console.log(`
📦 Seed Script Runner

Usage:
  pnpm seed [script...] [options]

If no script is specified, runs ALL scripts in dependency order:
  tags → wemeditate → storyblok → meditations

Available Scripts:
  storyblok     Seed Path Steps from Storyblok CMS
  wemeditate    Seed content from WeMeditate Rails database
  meditations   Seed meditation content from legacy database
  tags          Seed MeditationTags and MusicTags from Cloudinary

Options:
  --dry-run      Validate data without writing to database
  --clear-cache  Clear download cache before import

Environment Variables:
  SAHAJCLOUD_URL  Target URL (default: http://localhost:PORT)
  ADMIN_EMAIL     Admin email for authentication
  ADMIN_PASSWORD  Admin password for authentication

Examples:
  pnpm seed                           # Run all scripts in order
  pnpm seed --dry-run                 # Dry run all scripts
  pnpm seed storyblok --dry-run       # Run single script
  pnpm seed tags wemeditate           # Run multiple scripts
  pnpm seed wemeditate --clear-cache

  # Seed production
  SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed
`)
}

function printScripts(): void {
  console.log('\nAvailable scripts:')
  for (const name of VALID_SCRIPTS) {
    console.log(`  ${name.padEnd(14)} → ${SCRIPT_DESCRIPTIONS[name]}`)
  }
  console.log('')
}

/**
 * Authenticate with the API and return session cookies
 */
async function authenticate(baseUrl: string): Promise<string> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error(
      'Missing authentication credentials.\n' +
        'Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.',
    )
  }

  console.log(`🔐 Authenticating as ${email}...`)

  const response = await fetch(`${baseUrl}/api/managers/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Authentication failed: ${response.status} ${error}`)
  }

  const cookies = response.headers.get('set-cookie')
  if (!cookies) {
    throw new Error('No session cookie received from login')
  }

  console.log('✅ Authentication successful\n')
  return cookies
}

/**
 * Parse SSE events from a ReadableStream
 */
async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            yield data
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Document result from import event
 */
interface DocumentResult {
  collection: string
  identifier: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
  warnings?: string[]
}

/**
 * Display handler with state for collection headers
 */
class ProgressDisplay {
  private currentCollection = ''

  displayEvent(event: Record<string, unknown>): void {
    const type = event.type as string

    switch (type) {
      case 'start':
        console.log(`\n${'='.repeat(60)}`)
        console.log(`${event.script} import`)
        if (event.dryRun) {
          console.log('Mode: DRY RUN')
        }
        console.log('='.repeat(60))
        break

      case 'document': {
        const doc = event.document as DocumentResult
        if (!doc) break

        // Print collection header when collection changes
        if (doc.collection !== this.currentCollection) {
          console.log(`\n📁 ${doc.collection}:`)
          this.currentCollection = doc.collection
        }

        // Determine emoji based on action
        const emoji =
          doc.action === 'created'
            ? '✅'
            : doc.action === 'updated'
              ? '🔄'
              : doc.action === 'skipped'
                ? '⏭️'
                : '❌'

        // Build status text
        const status = doc.action === 'error' ? `${doc.error}` : doc.action
        console.log(`  ${emoji} ${doc.identifier} — ${status}`)

        // Display warnings if any
        if (doc.warnings?.length) {
          for (const w of doc.warnings) {
            console.log(`     ⚠️  ${w}`)
          }
        }
        break
      }

      case 'complete': {
        const summary = event.summary as Record<string, unknown>

        // Summary line with emojis
        console.log('')
        console.log(
          `📊 ✅ ${summary.created} created  🔄 ${summary.updated} updated  ⏭️ ${summary.skipped} skipped  ❌ ${summary.errors} errors`,
        )

        // Display verification results
        const verification = summary.verification as
          | { collection: string; actual: number; expected: number; passed: boolean }[]
          | undefined
        const verificationPassed = summary.verificationPassed as boolean | undefined

        if (verification && verification.length > 0) {
          console.log('\n🔍 Verification:')
          for (const { collection, actual, expected, passed } of verification) {
            const emoji = passed ? '✅' : '❌'
            console.log(`   ${emoji} ${collection}: ${actual} (≥${expected})`)
          }
        }

        // Display error messages
        const errorMessages = summary.errorMessages as string[] | undefined
        if (errorMessages && errorMessages.length > 0) {
          console.log('\n🚨 Errors:')
          for (const msg of errorMessages) {
            console.log(`   ❌ ${msg}`)
          }
        }

        // Display warning messages
        const warningMessages = summary.warningMessages as string[] | undefined
        if (warningMessages && warningMessages.length > 0) {
          console.log('\n⚠️  Warnings:')
          for (const msg of warningMessages) {
            console.log(`   ⚠️  ${msg}`)
          }
        }

        const errorCount = summary.errors as number
        if (errorCount === 0 && verificationPassed !== false) {
          console.log('\n🎉 Import completed successfully!')
        } else if (verificationPassed === false) {
          console.log('\n💥 Import failed — verification not met')
        } else {
          console.log(`\n💥 Import completed with ${errorCount} error(s)`)
        }
        break
      }

      case 'error':
        console.error(`\n❌ Error: ${event.message}`)
        break
    }
  }

  reset(): void {
    this.currentCollection = ''
  }
}

interface ScriptResult {
  script: ScriptName
  success: boolean
  errors: string[]
}

// Shared display instance for tracking collection state
const display = new ProgressDisplay()

/**
 * Run a single seed script via the API
 */
async function runScript(
  scriptName: ScriptName,
  baseUrl: string,
  cookies: string,
  options: { dryRun: boolean; clearCache: boolean },
): Promise<ScriptResult> {
  const { dryRun, clearCache } = options
  const errors: string[] = []

  // Reset display state for new script
  display.reset()

  // Build query params
  const params = new URLSearchParams()
  if (dryRun) params.set('dryRun', 'true')
  if (clearCache) params.set('clearCache', 'true')
  const queryString = params.toString()
  const url = `${baseUrl}/api/seed/${scriptName}${queryString ? `?${queryString}` : ''}`

  try {
    // Call the seed API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: cookies,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMsg = `API request failed: ${response.status} ${errorText}`
      console.error(`❌ ${errorMsg}`)
      errors.push(errorMsg)
      return { script: scriptName, success: false, errors }
    }

    if (!response.body) {
      const errorMsg = 'No response body received'
      console.error(`❌ ${errorMsg}`)
      errors.push(errorMsg)
      return { script: scriptName, success: false, errors }
    }

    // Parse SSE stream and display progress
    for await (const event of parseSSE(response.body)) {
      display.displayEvent(event)

      // Collect error events
      if (event.type === 'error') {
        errors.push(String(event.message || 'Unknown error'))
      }

      // Collect errors from 'complete' event summary
      if (event.type === 'complete') {
        const summary = event.summary as Record<string, unknown> | undefined
        if (summary) {
          // Collect actual error messages if available
          const errorMessages = summary.errorMessages as string[] | undefined
          if (errorMessages && errorMessages.length > 0) {
            errors.push(...errorMessages)
          } else if (typeof summary.errors === 'number' && summary.errors > 0) {
            // Fallback if messages not provided
            errors.push(`Import completed with ${summary.errors} error(s)`)
          }

          // Check verification result
          if (summary.verificationPassed === false) {
            errors.push('Count verification failed')
          }
        }
      }
    }

    return { script: scriptName, success: errors.length === 0, errors }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`❌ Error: ${errorMsg}`)
    errors.push(errorMsg)
    return { script: scriptName, success: false, errors }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  // Handle list flag
  if (args.includes('--list') || args.includes('-l')) {
    printScripts()
    process.exit(0)
  }

  // Determine which scripts to run
  const scriptsToRun: ScriptName[] = []
  const optionArgs: string[] = []

  for (const arg of args) {
    if (arg.startsWith('--')) {
      optionArgs.push(arg)
    } else if (VALID_SCRIPTS.includes(arg as ScriptName)) {
      scriptsToRun.push(arg as ScriptName)
    } else {
      console.error(`❌ Unknown script: ${arg}`)
      printScripts()
      process.exit(1)
    }
  }

  // Validate options
  for (const arg of optionArgs) {
    if (!VALID_OPTIONS.includes(arg)) {
      console.error(`❌ Unknown option: ${arg}`)
      console.error(`\nValid options: ${VALID_OPTIONS.join(', ')}`)
      process.exit(1)
    }
  }

  const dryRun = optionArgs.includes('--dry-run')
  const clearCache = optionArgs.includes('--clear-cache')

  // If no scripts specified, run all in dependency order
  const scripts = scriptsToRun.length > 0 ? scriptsToRun : SCRIPT_RUN_ORDER

  // Determine target URL
  const baseUrl =
    process.env.SAHAJCLOUD_URL || `http://localhost:${process.env.PORT || 3000}`

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Seed Script Runner`)
  console.log(`${'='.repeat(60)}`)
  console.log(`Target: ${baseUrl}`)
  console.log(`Scripts: ${scripts.join(' → ')}`)
  if (dryRun) console.log('Mode: DRY RUN')
  if (clearCache) console.log('Option: Clear cache')

  try {
    // Authenticate and get session cookie
    const cookies = await authenticate(baseUrl)

    // Run each script in order
    const results: ScriptResult[] = []

    for (const scriptName of scripts) {
      const result = await runScript(scriptName, baseUrl, cookies, { dryRun, clearCache })
      results.push(result)

      if (!result.success) {
        console.error(`\n⚠️  Script "${scriptName}" completed with errors`)
      }
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`)
    console.log('OVERALL SUMMARY')
    console.log('='.repeat(60))

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    console.log(`\n✅ Successful: ${successful.length}`)
    for (const r of successful) {
      console.log(`   - ${r.script}`)
    }

    if (failed.length > 0) {
      console.log(`\n❌ Failed: ${failed.length}`)
      for (const r of failed) {
        console.log(`   - ${r.script}`)
        for (const error of r.errors) {
          console.log(`     └─ ${error}`)
        }
      }
    }

    console.log('')
    process.exit(failed.length > 0 ? 1 : 0)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
