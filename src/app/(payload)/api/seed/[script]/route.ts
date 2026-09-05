/**
 * Seed API route.
 *
 * GET /api/seed/:script
 *   Returns metadata about the script's collections. Use it to plan pagination.
 *
 * POST /api/seed/:script
 *   Starts content seeding for the named script.
 *   Streams progress updates over Server-Sent Events.
 *
 * Scripts:
 * - tags: UserChoices, SongTags, and SubtleSystemNodes
 * - wemeditate: Authors, Albums, Music, Pages
 * - meditations: Meditations, Frames, Music
 * - storyblok: Lessons, Lectures
 * - wm-app-translations: WeMeditate App Translations global (English seed)
 * - translations: All three translation globals (English seed)
 *
 * Authentication: Needs an admin session.
 *
 * Query parameters (POST):
 * - dryRun: 'true' validates the data. It does not write to the database.
 * - update: 'true' updates existing records. The default skips existing records.
 * - collection: Target collection for a paginated import. Required with offset or limit.
 * - offset: Start index for pagination. Default: 0.
 * - limit: Maximum items to process. Default: set by the environment.
 */

import type { BaseImporter } from '../../../../../../seeds/lib/BaseImporter'
import type { NextRequest } from 'next/server'

import { getPayload } from 'payload'

import config from '@payload-config'

import {
  getScriptMetadata,
  verifyCountsForScript,
  type ScriptName,
} from '../../../../../../seeds/lib/expectedCounts'
import {
  validatePaginationParam,
  type PaginationOptions,
  type PaginationResult,
} from '../../../../../../seeds/lib/pagination'

const VALID_SCRIPTS: ScriptName[] = [
  'tags',
  'wemeditate',
  'meditations',
  'storyblok',
  'wm-app-translations',
  'translations',
  'atlas',
]

/**
 * Heartbeat interval, in milliseconds (5 seconds).
 * Prevents the Cloudflare Workers 100-second idle timeout.
 */
const HEARTBEAT_INTERVAL = 5_000

/**
 * GET /api/seed/:script
 *
 * Returns metadata about the script's collections. Use it to plan pagination.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ script: string }> },
) {
  const { script } = await params

  // Validate script name
  if (!VALID_SCRIPTS.includes(script as ScriptName)) {
    return new Response(
      JSON.stringify({
        error: `Invalid script: ${script}`,
        validScripts: VALID_SCRIPTS,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })

  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (user.collection !== 'managers' || !('type' in user) || user.type !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const metadata = getScriptMetadata(script as ScriptName)

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * POST /api/seed/:script
 *
 * Starts content seeding. Query parameters control paginated runs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ script: string }> },
) {
  const { script } = await params

  // Validate script name
  if (!VALID_SCRIPTS.includes(script as ScriptName)) {
    return new Response(
      JSON.stringify({
        error: `Invalid script: ${script}`,
        validScripts: VALID_SCRIPTS,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })

  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (user.collection !== 'managers' || !('type' in user) || user.type !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Parse query parameters
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'
  const updateMode = request.nextUrl.searchParams.get('update') === 'true'
  const collection = request.nextUrl.searchParams.get('collection')
  const offsetParam = request.nextUrl.searchParams.get('offset')
  const limitParam = request.nextUrl.searchParams.get('limit')

  // Optional request body: raw seed-file contents from the CLI.
  // The CLI sends this when the Worker cannot fetch a private repo file itself.
  // The key is DataSource.localPath.
  // Most requests have no body, so a parse failure here is normal. Ignore it.
  let inlineData: Record<string, string> | undefined
  try {
    const body = (await request.json()) as { inlineData?: Record<string, string> } | null
    if (body?.inlineData && typeof body.inlineData === 'object') {
      inlineData = body.inlineData
    }
  } catch {
    // No body, or invalid JSON. The importer falls back to a filesystem or remote fetch.
  }

  // Validate pagination parameters. Offset and limit both require a collection.
  if ((offsetParam !== null || limitParam !== null) && !collection) {
    return new Response(
      JSON.stringify({
        error: 'Pagination requires collection parameter',
        hint: 'Use ?collection=<name>&offset=<n>&limit=<n>',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Validate that offset and limit are non-negative integers.
  // A unit test in seeds/lib/pagination.ts covers this path without a running server.
  const paginationError =
    validatePaginationParam('offset', offsetParam) ?? validatePaginationParam('limit', limitParam)
  if (paginationError) {
    return new Response(JSON.stringify(paginationError), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build pagination options when a collection is set.
  let pagination: PaginationOptions | undefined
  if (collection) {
    pagination = {
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
      limit: limitParam ? parseInt(limitParam, 10) : 0, // 0 means use default
      collection,
    }
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Helper to send SSE events
  const DEBUG = process.env.DEBUG_IMPORT === 'true'
  const sendEvent = async (data: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(`[API_SSE] Sending: ${data.type}`)
    const message = `data: ${JSON.stringify(data)}\n\n`
    await writer.write(encoder.encode(message))
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(`[API_SSE] Sent: ${data.type}`)
  }

  // Run the importer in the background
  const runImporter = async () => {
    let importerInstance: BaseImporter | null = null
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null

    try {
      await sendEvent({
        type: 'start',
        script,
        dryRun,
        pagination: pagination || null,
        timestamp: new Date().toISOString(),
      })

      // Dynamically import the appropriate importer
      const importer = await getImporter(
        script as ScriptName,
        payload,
        dryRun,
        updateMode,
        sendEvent,
        pagination,
        inlineData,
      )

      if (!importer) {
        await sendEvent({
          type: 'error',
          message: `Failed to load importer for script: ${script}`,
        })
        await writer.close()
        return
      }

      // Store importer reference for heartbeat access
      importerInstance = importer
      const importStartTime = Date.now()

      // Send an initial heartbeat right away, for instant feedback.
      await sendEvent({
        type: 'heartbeat',
        operation: 'Starting...',
        elapsedMs: 0,
      })

      // Start the heartbeat interval to prevent the Cloudflare 100-second idle timeout.
      const sendHeartbeat = async () => {
        try {
          const operation = importerInstance?.getCurrentOperation() || 'Processing...'
          const elapsedMs = Date.now() - importStartTime
          await sendEvent({
            type: 'heartbeat',
            operation,
            elapsedMs,
          })
        } catch {
          // The stream may be closed. Stop the heartbeat.
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval)
            heartbeatInterval = null
          }
        }
      }

      // Send the first heartbeat now, then repeat on the interval.
      await sendHeartbeat()
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

      await importer.run()

      const counts = await getDatabaseCounts(payload, script as ScriptName)

      // Verify counts against the expected minimums. Pagination adjusts the minimums when it applies.
      const { results: verification, allPassed: verificationPassed } = verifyCountsForScript(
        script as ScriptName,
        counts,
        pagination,
      )

      const report = importer.getReport()
      const errorMessages = report.getErrors()
      const warningMessages = report.getWarnings()

      // Build the pagination result when pagination is set.
      let paginationResult: PaginationResult | null = null
      if (pagination) {
        paginationResult = {
          offset: pagination.offset,
          limit: pagination.limit,
          processedCount: importer.getProcessedCount(),
          hasMore: importer.hasMoreItems(),
          nextOffset: importer.getNextOffset(),
          collection: pagination.collection,
        }
      }

      // Send completion event
      await sendEvent({
        type: 'complete',
        summary: {
          created: report.getSummary().created,
          updated: report.getSummary().updated,
          skipped: report.getSummary().skipped,
          errors: report.getSummary().errors,
          warnings: report.getWarningCount(),
          errorMessages,
          warningMessages,
          counts,
          verification,
          verificationPassed,
        },
        pagination: paginationResult,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await sendEvent({
        type: 'error',
        message,
      })
    } finally {
      // Stop the heartbeat interval.
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      await writer.close()
    }
  }

  // Start the importer, but do not wait for it. It runs in the background.
  runImporter()

  // Return the SSE response.
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/**
 * Return the importer class for the named script.
 */
async function getImporter(
  script: ScriptName,
  payload: Awaited<ReturnType<typeof getPayload>>,
  dryRun: boolean,
  updateMode: boolean,
  onProgress: (data: Record<string, unknown>) => Promise<void>,
  pagination?: PaginationOptions,
  inlineData?: Record<string, string>,
) {
  const options = {
    dryRun,
    clearCache: false,
    updateMode,
    payload,
    onProgress,
    pagination,
    inlineData,
  }

  switch (script) {
    case 'tags': {
      const { TagsImporter } = await import('../../../../../../seeds/tags/import')
      return new TagsImporter(options)
    }
    case 'wemeditate': {
      const { WeMeditateImporter } = await import('../../../../../../seeds/wemeditate/import')
      return new WeMeditateImporter(options)
    }
    case 'meditations': {
      const { MeditationsImporter } = await import('../../../../../../seeds/meditations/import')
      return new MeditationsImporter(options)
    }
    case 'storyblok': {
      const token = process.env.STORYBLOK_ACCESS_TOKEN
      if (!token) {
        throw new Error('STORYBLOK_ACCESS_TOKEN environment variable is required')
      }
      const { StoryblokImporter } = await import('../../../../../../seeds/storyblok/import')
      return new StoryblokImporter(options, token)
    }
    case 'wm-app-translations': {
      const { WeMeditateAppTranslationsImporter } =
        await import('../../../../../../seeds/wm-app-translations/import')
      return new WeMeditateAppTranslationsImporter(options)
    }
    case 'translations': {
      const { TranslationsImporter } = await import('../../../../../../seeds/translations/import')
      return new TranslationsImporter(options)
    }
    case 'atlas': {
      const { AtlasImporter } = await import('../../../../../../seeds/atlas/import')
      return new AtlasImporter(options)
    }
    default:
      return null
  }
}

/**
 * Return database counts for verification.
 */
async function getDatabaseCounts(
  payload: Awaited<ReturnType<typeof getPayload>>,
  script: ScriptName,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  try {
    switch (script) {
      case 'tags': {
        // image-tags no longer exists. Its values are now inline enum strings on Images.
        const userChoices = await payload.count({ collection: 'user-choices' })
        const songTags = await payload.count({ collection: 'song-tags' })
        counts['user-choices'] = userChoices.totalDocs
        counts['song-tags'] = songTags.totalDocs
        break
      }
      case 'wemeditate': {
        const authors = await payload.count({ collection: 'authors' })
        const albums = await payload.count({ collection: 'albums' })
        const songs = await payload.count({ collection: 'songs' })
        const pages = await payload.count({ collection: 'pages' })
        counts['authors'] = authors.totalDocs
        counts['albums'] = albums.totalDocs
        counts['songs'] = songs.totalDocs
        counts['pages'] = pages.totalDocs
        break
      }
      case 'meditations': {
        const narrators = await payload.count({ collection: 'narrators' })
        const meditations = await payload.count({ collection: 'meditations' })
        const frames = await payload.count({ collection: 'frames' })
        counts['narrators'] = narrators.totalDocs
        counts['meditations'] = meditations.totalDocs
        counts['frames'] = frames.totalDocs
        break
      }
      case 'storyblok': {
        const lessons = await payload.count({ collection: 'lessons' })
        const lectures = await payload.count({ collection: 'lectures' })
        counts['lessons'] = lessons.totalDocs
        counts['lectures'] = lectures.totalDocs
        break
      }
      case 'wm-app-translations':
      case 'translations': {
        // These scripts target PayloadCMS globals, not collections.
        // Verification sees an empty EXPECTED_COUNTS entry and passes by default.
        break
      }
      case 'atlas': {
        const [managers, regions, users, events, registrations, clients] = await Promise.all([
          payload.count({ collection: 'managers' }),
          payload.count({ collection: 'regions' }),
          payload.count({ collection: 'users' }),
          payload.count({ collection: 'events' }),
          payload.count({ collection: 'registrations' }),
          payload.count({ collection: 'clients' }),
        ])
        counts['managers'] = managers.totalDocs
        counts['regions'] = regions.totalDocs
        counts['users'] = users.totalDocs
        counts['events'] = events.totalDocs
        counts['registrations'] = registrations.totalDocs
        counts['clients'] = clients.totalDocs
        break
      }
    }
  } catch (error) {
    // Log the error, but do not fail the request. Counts are for verification only.
    payload.logger.error({ msg: 'Failed to get database counts', error })
  }

  return counts
}
