#!/usr/bin/env tsx

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
 *   tags → wemeditate → meditations → meditation-transcripts → storyblok → wm-app-translations → atlas
 *
 * Scripts:
 *   storyblok    - Seed Path Steps from Storyblok CMS
 *   wemeditate   - Seed content from WeMeditate Rails database
 *   meditations  - Seed meditation content from legacy database
 *   tags         - Seed UserChoices and MusicTags from Cloudinary
 *
 * Options:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 *
 * Environment Variables:
 *   SAHAJCLOUD_URL  - Target URL (default: http://localhost:PORT)
 *   ADMIN_TOKEN     - A manager session token, for a remote target (not needed locally)
 *   PORT            - Local dev server port (default: 3000)
 *
 * Local dev enables Payload's `admin.autoLogin`, so no credentials are
 * needed against a local server. They are only required for a remote target.
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

import type { ScriptName, VerificationResult } from './lib/expectedCounts'
import type { ScriptMetadata, PaginationResult } from './lib/pagination'

import { seedEnv } from './env'
import { SCRIPT_DATA_FILES } from './lib/dataFiles'
import { accessTokenHeaders, PREVIEW_ADMIN_ADDRESS } from '../src/lib/preview/proxy'

const VALID_SCRIPTS: ScriptName[] = [
  'storyblok',
  'wemeditate',
  'meditations',
  'meditation-transcripts',
  'tags',
  'wm-app-translations',
  'translations',
  'atlas',
  // Never in SCRIPT_RUN_ORDER: destructive, so it runs only when named.
  'atlas-reset',
  // Never in SCRIPT_RUN_ORDER either: every run it queues is a paid vendor call.
  'file-transcripts',
  // Never in SCRIPT_RUN_ORDER either: it is a preview's content, so a full
  // seed of any other target must not pull it in.
  'preview-fixture',
]

// Dependency order: tags first (referenced by other content), then wemeditate (authors/categories),
// then storyblok (lessons), then meditations (may reference tags, narrators, etc.),
// finally wm-app-translations (independent — updates a PayloadCMS global, no cross-collection deps).
const SCRIPT_RUN_ORDER: ScriptName[] = [
  'tags',
  'wemeditate',
  'meditations',
  // Resolves each transcript against a meditation, so it follows them.
  'meditation-transcripts',
  'storyblok',
  'wm-app-translations',
  // Atlas is independent of the WeMeditate content above (distinct collections).
  'atlas',
]

const SCRIPT_DESCRIPTIONS: Record<ScriptName, string> = {
  storyblok: 'Seed Path Steps from Storyblok CMS',
  wemeditate: 'Seed content from WeMeditate Rails database',
  meditations: 'Seed meditation content from legacy database',
  'meditation-transcripts': "Import the library's existing meditation transcripts",
  tags: 'Seed UserChoices and MusicTags from Cloudinary',
  'wm-app-translations': 'Seed English copy for the wm-app-translations global',
  translations: 'Seed English copy for all three translation globals',
  atlas: 'Seed Sahaj Atlas events, regions, managers, registrations + clients',
  'atlas-reset': '⚠ Delete every Atlas event, region, user and user-submission (before a re-sync)',
  'file-transcripts': 'Transcribe every audio and video file that has no transcript (paid runs)',
  'preview-fixture': 'Fill a preview with made-up classes, managers, registrations and messages',
}

const VALID_OPTIONS = ['--dry-run', '--clear-cache', '--update']

/**
 * Read a script's registered data files into an inlineData map (path → raw
 * contents) for upload. Returns undefined when the script needs no upload.
 */
async function loadInlineData(scriptName: ScriptName): Promise<Record<string, string> | undefined> {
  const files = SCRIPT_DATA_FILES[scriptName]
  if (!files?.length) return undefined

  const { readFile } = await import('node:fs/promises')
  const entries = await Promise.all(
    files.map(async (filePath) => [filePath, await readFile(filePath, 'utf-8')] as const),
  )
  return Object.fromEntries(entries)
}

/**
 * The Cloudflare Access service-token headers, when this run holds one.
 *
 * Access sits in front of every preview address, so a run targeting one carries
 * these on every request — including the auto-login probe, which would otherwise
 * read a login page rather than the target. Both or neither: Access logs a blank
 * client id as a failed service-token attempt.
 */
function accessHeaders(): Record<string, string> {
  return accessTokenHeaders(seedEnv.CF_ACCESS_CLIENT_ID, seedEnv.CF_ACCESS_CLIENT_SECRET)
}

/**
 * Auth header for a seed request. `null` means we are relying on the target's
 * auto-login (see `authenticate`), so the request must go out *without* an
 * `Authorization` header for Payload's tokenless path to kick in.
 */
function authHeaders(token: string | null): Record<string, string> {
  return { ...accessHeaders(), ...(token ? { Authorization: `JWT ${token}` } : {}) }
}

/**
 * Build the fetch init for a seed POST: auth header plus, when present, the
 * uploaded seed-data files in the JSON body.
 */
function seedPostInit(token: string | null, inlineData?: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      ...(inlineData ? { 'Content-Type': 'application/json' } : {}),
    },
    body: inlineData ? JSON.stringify({ inlineData }) : undefined,
  }
}

/** Format elapsed milliseconds as human-readable string (for example, "1m 30s") */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

function printUsage(): void {
  console.log(`
📦 Seed Script Runner

Usage:
  pnpm seed [script...] [options]

If no script is specified, runs ALL scripts in dependency order:
  tags → wemeditate → meditations → meditation-transcripts → storyblok → wm-app-translations → atlas

Available Scripts:
  storyblok              Seed Path Steps from Storyblok CMS
  wemeditate             Seed content from WeMeditate Rails database
  meditations            Seed meditation content from legacy database
  meditation-transcripts Import the library's existing meditation transcripts
  tags                   Seed UserChoices and MusicTags from Cloudinary
  wm-app-translations    Seed English copy for the wm-app-translations global

Options:
  --dry-run      Validate data without writing to database
  --clear-cache  Clear download cache before import
  --update       Update existing records (default: skip existing)

Environment Variables:
  SAHAJCLOUD_URL  Target URL (default: http://localhost:PORT)
  ADMIN_TOKEN     A manager session token (only for a remote target)

Local dev enables auto-login, so seeding localhost needs no credentials.

Examples:
  pnpm seed                           # Run all scripts in order (skip existing)
  pnpm seed --dry-run                 # Dry run all scripts
  pnpm seed storyblok --update        # Update existing records
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
 * Does the target authenticate requests that carry no token at all?
 *
 * Local dev sets `admin.autoLogin` (see `src/payload.config.ts`), and Payload
 * applies that in its **JWT strategy**, not just the admin UI: a request with no
 * token is authenticated as the configured admin. `/api/managers/me` reports it
 * directly — a user for auto-login, `{ user: null }` otherwise.
 *
 * We probe the capability instead of matching on `localhost` because that's what
 * actually decides the outcome: production (and E2E) disable auto-login, so they
 * fall through to the credential path on their own, and a dev server on some
 * other host/port still gets the no-credentials treatment.
 */
async function hasAutoLogin(baseUrl: string): Promise<boolean> {
  const probe = async (headers?: Record<string, string>): Promise<boolean> => {
    const response = await fetch(`${baseUrl}/api/managers/me`, {
      cache: 'no-store',
      headers: { ...accessHeaders(), ...headers },
    })
    if (!response.ok) return false
    const { user } = (await response.json()) as { user?: unknown }
    return Boolean(user)
  }

  try {
    if (!(await probe())) return false

    // A truthy `user` on its own is not proof: an edge cache in front of a remote
    // target can replay a *previously authenticated* response to our tokenless
    // request, which would look identical. `DisableAutologin` is the tell — a
    // live Payload always answers it with `{ user: null }`, so a user here means
    // we are reading a cached body, not talking to an auto-login server.
    return !(await probe({ DisableAutologin: 'true' }))
  } catch {
    // Unreachable target — let the real seed request report the failure.
    return false
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Enough of a refusal to recognise it, and not enough to bury the advice under it. */
const excerpt = (body: string): string => {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (!flat) return '(empty body)'
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat
}

/**
 * Ask a gated preview to sign the provisioned admin in, and return the session.
 *
 * ⚠ **This works on a preview and nowhere else**, which is the point:
 * `previewAutoSignIn` is on only where Railway names a non-production
 * environment, and on production the same call answers `{ ok: true }` with no
 * token, because any difference would be an account-enumeration oracle on an
 * anonymous endpoint. So a target that hands a token back has already decided
 * this run may have one — and the credential that got the request past Access is
 * the service token above, never an address.
 *
 * `/api/seed/<script>` admits only an admin manager, which is why this asks for
 * the provisioned admin rather than any of the fixture's managers.
 */
async function previewSignIn(baseUrl: string): Promise<{ detail?: string; token?: string }> {
  const route = `${baseUrl}/api/managers/request-magic-link`
  let response: Response
  try {
    response = await fetch(route, {
      method: 'POST',
      headers: { ...accessHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PREVIEW_ADMIN_ADDRESS }),
    })
  } catch (error) {
    return { detail: `POST ${route} did not answer: ${errorMessage(error)}` }
  }

  const body = await response.text().catch(errorMessage)
  const answered = `POST ${route} answered HTTP ${response.status}`
  if (!response.ok) return { detail: `${answered}: ${excerpt(body)}` }

  let token: string | undefined
  try {
    token = (JSON.parse(body) as { token?: string }).token
  } catch {
    return { detail: `${answered} with a body that is not JSON: ${excerpt(body)}` }
  }
  if (!token) {
    return { detail: `${answered} and no token, so this target signs nobody in: ${excerpt(body)}` }
  }

  console.log(`🔐 Signed in as ${PREVIEW_ADMIN_ADDRESS} — this target is a preview\n`)
  return { token }
}

/**
 * Return the session token for the `Authorization` header, or `null` when the
 * target auto-logs-in and no credentials are needed.
 *
 * ⚠ **The token is sent as a header, never forwarded as a cookie**, even though
 * `ADMIN_TOKEN` is copied out of one. Payload's CSRF protection ignores
 * cookie-based JWTs unless the request `Origin` matches the configured `csrf`
 * allowlist — which a server-to-server fetch cannot satisfy, since it sends no
 * `Origin`. `Authorization: JWT <token>` is not subject to CSRF, so it is the
 * correct mechanism here. Do not switch this to cookie forwarding.
 *
 * There is nothing to authenticate *against* any more: managers hold no
 * password and `POST /api/managers/login` answers 403 everywhere (#840), so the
 * operator supplies a token from a session they already hold.
 */
async function authenticate(baseUrl: string): Promise<string | null> {
  if (await hasAutoLogin(baseUrl)) {
    console.log('🔓 Auto-login is active — no credentials needed\n')
    return null
  }

  const supplied = seedEnv.ADMIN_TOKEN
  const attempted = supplied ? undefined : await previewSignIn(baseUrl)
  const token = supplied ?? attempted?.token

  if (!token) {
    throw new Error(
      // The refusal leads, because it is usually the whole answer: a gate 403,
      // an Access login page and a target with the sign-in off all used to
      // arrive as the ADMIN_TOKEN advice below, which is wrong for each of them.
      (attempted?.detail ? `${attempted.detail}\n\n` : '') +
        'Missing authentication credentials.\n' +
        'A preview of this repo signs its own admin in, so a run against one needs ' +
        'only CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET.\n' +
        'Otherwise set ADMIN_TOKEN to a manager session token. Request a sign-in link at ' +
        "the target's /admin/login, then run\n" +
        "  pnpm tsx scripts/redeem-signin-link.ts '<link>' --seed <script>\n" +
        'which runs this with ADMIN_TOKEN set from the link.\n' +
        'There is no ADMIN_PASSWORD to send instead: managers hold no password, ' +
        'and POST /api/managers/login answers 403 everywhere (#840).\n' +
        '(Local dev normally needs none — auto-login covers it. Seeing this ' +
        'against localhost means the server is running in production or E2E mode.)',
    )
  }

  // Not verified here: the first seeded write reports a stale or wrong token as
  // its own 403, and there is no cheap probe that would not be a second guess at
  // what "authenticated" means.
  if (supplied) console.log('🔐 Using the supplied ADMIN_TOKEN\n')
  return token
}

/** Parse SSE events from a ReadableStream */
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

/** Document result from import event */
interface DocumentResult {
  collection: string
  identifier: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
  warnings?: string[]
}

/** Display handler with state for collection headers */
class ProgressDisplay {
  private currentCollection = ''

  displayEvent(event: Record<string, unknown>): void {
    const type = event.type as string

    // Extract pagination context from event (available in start and complete events)
    const pagination = event.pagination as { offset?: number; hasMore?: boolean } | null

    switch (type) {
      case 'start': {
        // Only show header on first batch (offset=0 or non-paginated)
        const isFirstBatch = !pagination?.offset
        if (isFirstBatch) {
          console.log(`\n${'='.repeat(60)}`)
          console.log(`${event.script} import`)
          if (event.dryRun) {
            console.log('Mode: DRY RUN')
          }
          console.log('='.repeat(60))
        }
        break
      }

      case 'heartbeat': {
        // Display heartbeat on same line, overwriting previous heartbeat
        const operation = (event.operation as string) || 'Processing...'
        const elapsedMs = (event.elapsedMs as number) || 0
        const elapsed = formatElapsed(elapsedMs)
        process.stdout.write(`\r  ⏳ ${operation} (${elapsed})`)
        break
      }

      case 'document': {
        const doc = event.document as DocumentResult
        if (!doc) break

        // Clear any heartbeat line before printing document
        process.stdout.write('\r\x1b[K')

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
        // Clear any heartbeat line
        process.stdout.write('\r\x1b[K')

        // For intermediate batches (hasMore=true), suppress the full summary
        // Only show the full summary on the final batch or non-paginated imports
        const isIntermediateBatch = pagination?.hasMore === true
        if (isIntermediateBatch) {
          // Silent completion for intermediate batches - progress shown by CLI's batch loop
          break
        }

        const summary = event.summary as Record<string, unknown>

        // Summary line with emojis
        console.log('')
        console.log(
          `📊 ✅ ${summary.created} created  🔄 ${summary.updated} updated  ⏭️ ${summary.skipped} skipped  ❌ ${summary.errors} errors`,
        )

        // Display verification results
        const verification = summary.verification as VerificationResult[] | undefined
        const verificationPassed = summary.verificationPassed as boolean | undefined

        const skippedReason = summary.verificationSkippedReason as string | null | undefined
        const runFailures = (summary.runVerificationFailures as string[] | undefined) ?? []

        if (verification && verification.length > 0) {
          console.log('\n🔍 Verification:')
          for (const { collection, actual, expected, passed } of verification) {
            const emoji = passed ? '✅' : '❌'
            console.log(`   ${emoji} ${collection}: ${actual} (≥${expected})`)
          }
        }

        if (skippedReason) {
          // Say so. A silent pass and a real pass used to print identically.
          console.log(`\n🔍 Verification skipped: ${skippedReason}`)
        }

        if (runFailures.length > 0) {
          console.log('\n🔍 Run verification failed:')
          for (const failure of runFailures) {
            console.log(`   ❌ ${failure}`)
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

      case 'info':
        // Clear any heartbeat line
        process.stdout.write('\r\x1b[K')
        console.log(`  ℹ️  ${event.message}`)
        break

      case 'error':
        // Clear any heartbeat line
        process.stdout.write('\r\x1b[K')
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

/** Delay utility for rate limiting between paginated requests */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const SEND_ATTEMPTS = 4

/**
 * Send a seed request again when it never got a response. `fetch` rejects only
 * before the response headers arrive, which here means while the body was still
 * uploading — the server logs the same request as `aborted` and runs nothing.
 * Every batch re-uploads the whole data set (Atlas: ~3.7 MB, ~300 times), and a
 * long import to production drops one now and then; without a retry the
 * 2026-11 re-sync died 13 batches into `users`, twice. A failure after the
 * response starts is never retried: the server may still be running that batch.
 */
async function sendSeedRequest(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init)
    } catch (error) {
      if (attempt >= SEND_ATTEMPTS) throw error
      const cause = (error as { cause?: { code?: string; message?: string } }).cause
      console.warn(
        `   ⚠️  Request dropped (${cause?.code ?? cause?.message ?? String(error)}), resending (${attempt}/${SEND_ATTEMPTS - 1})`,
      )
      await delay(5000 * attempt)
    }
  }
}

/** Fetch script metadata from GET endpoint */
async function fetchScriptMetadata(
  scriptName: ScriptName,
  baseUrl: string,
  token: string | null,
): Promise<ScriptMetadata> {
  const url = `${baseUrl}/api/seed/${scriptName}`

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(token),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch metadata: ${response.status} ${errorText}`)
  }

  return response.json()
}

/** Run a single paginated request and return pagination result */
async function runPaginatedRequest(
  scriptName: ScriptName,
  collection: string,
  offset: number,
  limit: number,
  baseUrl: string,
  token: string | null,
  options: { dryRun: boolean; updateMode: boolean; inlineData?: Record<string, string> },
): Promise<{ success: boolean; errors: string[]; pagination: PaginationResult | null }> {
  const errors: string[] = []

  // Build query params with pagination
  const params = new URLSearchParams()
  if (options.dryRun) params.set('dryRun', 'true')
  if (options.updateMode) params.set('update', 'true')
  params.set('collection', collection)
  params.set('offset', String(offset))
  params.set('limit', String(limit))

  const url = `${baseUrl}/api/seed/${scriptName}?${params.toString()}`

  const response = await sendSeedRequest(url, seedPostInit(token, options.inlineData))

  if (!response.ok) {
    const errorText = await response.text()
    errors.push(`API request failed: ${response.status} ${errorText}`)
    return { success: false, errors, pagination: null }
  }

  if (!response.body) {
    errors.push('No response body received')
    return { success: false, errors, pagination: null }
  }

  let pagination: PaginationResult | null = null

  // Parse SSE stream
  for await (const event of parseSSE(response.body)) {
    display.displayEvent(event)

    if (event.type === 'error') {
      errors.push(String(event.message || 'Unknown error'))
    }

    if (event.type === 'complete') {
      // Extract pagination result
      pagination = event.pagination as PaginationResult | null

      const summary = event.summary as Record<string, unknown> | undefined
      if (summary) {
        const errorMessages = summary.errorMessages as string[] | undefined
        if (errorMessages && errorMessages.length > 0) {
          errors.push(...errorMessages)
        }
      }
    }
  }

  return { success: errors.length === 0, errors, pagination }
}

/** Run paginated import for collections that require it */
async function runPaginatedImport(
  scriptName: ScriptName,
  metadata: ScriptMetadata,
  baseUrl: string,
  token: string | null,
  options: {
    dryRun: boolean
    clearCache: boolean
    updateMode: boolean
    inlineData?: Record<string, string>
  },
): Promise<ScriptResult> {
  const errors: string[] = []
  const batchSize = metadata.recommendedBatchSize

  console.log(`\n${'='.repeat(60)}`)
  console.log(`${scriptName} import (paginated)`)
  if (options.dryRun) console.log('Mode: DRY RUN')
  console.log(`Batch size: ${batchSize}`)
  console.log('='.repeat(60))

  // Process each collection in dependency order
  for (const collection of metadata.collections) {
    if (collection.totalItems === 0) {
      console.log(`\n⏭️  Skipping ${collection.slug} (0 items)`)
      continue
    }

    console.log(`\n📁 Processing ${collection.slug} (${collection.totalItems} items)`)

    if (!collection.requiresPagination) {
      // Run without pagination for small collections
      console.log(`   Running bulk import...`)
      const result = await runPaginatedRequest(
        scriptName,
        collection.slug,
        0,
        0, // 0 means use default (all items)
        baseUrl,
        token,
        { dryRun: options.dryRun, updateMode: options.updateMode, inlineData: options.inlineData },
      )

      if (!result.success) {
        errors.push(...result.errors)
      }
    } else {
      // Run paginated import
      let offset = 0
      let batchNumber = 1
      let hasMore = true

      while (hasMore) {
        console.log(`   Batch ${batchNumber}: offset=${offset}, limit=${batchSize}`)

        const result = await runPaginatedRequest(
          scriptName,
          collection.slug,
          offset,
          batchSize,
          baseUrl,
          token,
          {
            dryRun: options.dryRun,
            updateMode: options.updateMode,
            inlineData: options.inlineData,
          },
        )

        if (!result.success) {
          errors.push(...result.errors)
          // Continue processing - errors are collected and reported at the end
        }

        if (result.pagination) {
          hasMore = result.pagination.hasMore
          offset = result.pagination.nextOffset
          console.log(
            `   ✓ Processed ${result.pagination.processedCount} items, hasMore=${hasMore}`,
          )
        } else {
          hasMore = false
        }

        batchNumber++

        // Add delay between batches to pace long-running imports
        // Reduced from 1000ms since bulk preloading reduces DB queries
        if (hasMore) {
          await delay(200)
        }
      }
    }
  }

  const success = errors.length === 0
  if (success) {
    console.log(`\n🎉 ${scriptName} import completed successfully!`)
  } else {
    console.log(`\n💥 ${scriptName} import completed with ${errors.length} error(s)`)
  }

  return { script: scriptName, success, errors }
}

/** Run a single seed script via the API */
async function runScript(
  scriptName: ScriptName,
  baseUrl: string,
  token: string | null,
  options: {
    dryRun: boolean
    clearCache: boolean
    updateMode: boolean
    inlineData?: Record<string, string>
  },
): Promise<ScriptResult> {
  const { dryRun, clearCache, updateMode } = options
  const errors: string[] = []

  // Reset display state for new script
  display.reset()

  // Build query params
  const params = new URLSearchParams()
  if (dryRun) params.set('dryRun', 'true')
  if (clearCache) params.set('clearCache', 'true')
  if (updateMode) params.set('update', 'true')
  const queryString = params.toString()
  const url = `${baseUrl}/api/seed/${scriptName}${queryString ? `?${queryString}` : ''}`

  try {
    // Call the seed API
    const response = await sendSeedRequest(url, seedPostInit(token, options.inlineData))

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
            // Both kinds can fail at once, and each names a different problem.
            // The route sends each verdict rather than leaving it to be re-derived.
            if (summary.countsPassed === false) {
              errors.push('Count verification failed')
            }
            errors.push(...((summary.runVerificationFailures as string[] | undefined) ?? []))
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
  const updateMode = optionArgs.includes('--update')

  // If no scripts specified, run all in dependency order
  const scripts = scriptsToRun.length > 0 ? scriptsToRun : SCRIPT_RUN_ORDER

  // Determine target URL
  const baseUrl = seedEnv.SAHAJCLOUD_URL || `http://localhost:${seedEnv.PORT}`

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Seed Script Runner`)
  console.log(`${'='.repeat(60)}`)
  console.log(`Target: ${baseUrl}`)
  console.log(`Scripts: ${scripts.join(' → ')}`)
  console.log(`Mode: ${updateMode ? 'UPDATE existing' : 'SKIP existing'}`)
  if (dryRun) console.log('Mode: DRY RUN')
  if (clearCache) console.log('Option: Clear cache')

  try {
    // Authenticate and get a JWT for the Authorization header
    const token = await authenticate(baseUrl)

    // Run each script in order
    const results: ScriptResult[] = []

    for (const scriptName of scripts) {
      // Always fetch metadata first to determine if pagination is needed
      let metadata: ScriptMetadata | null = null
      try {
        console.log(`\n📋 Fetching metadata for ${scriptName}...`)
        metadata = await fetchScriptMetadata(scriptName, baseUrl, token)
        console.log(`   Total items: ${metadata.totalItems}`)
        console.log(`   Requires pagination: ${metadata.requiresPagination}`)
      } catch (error) {
        console.warn(
          `   ⚠️  Could not fetch metadata: ${error instanceof Error ? error.message : error}`,
        )
        console.warn(`   Falling back to bulk import...`)
      }

      // Upload any private-repo data files this script needs (no-op otherwise).
      const inlineData = await loadInlineData(scriptName)

      let result: ScriptResult

      // Use paginated import if metadata indicates it is needed
      if (metadata?.requiresPagination) {
        result = await runPaginatedImport(scriptName, metadata, baseUrl, token, {
          dryRun,
          clearCache,
          updateMode,
          inlineData,
        })
      } else {
        // Use bulk import for small datasets
        result = await runScript(scriptName, baseUrl, token, {
          dryRun,
          clearCache,
          updateMode,
          inlineData,
        })
      }

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
