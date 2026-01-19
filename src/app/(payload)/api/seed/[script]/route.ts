/**
 * Seed API Route
 *
 * GET /api/seed/:script
 *   Returns metadata about the script's collections for pagination planning.
 *
 * POST /api/seed/:script
 *   Triggers content seeding for the specified script.
 *   Streams progress updates via Server-Sent Events.
 *
 * Scripts:
 * - tags: MeditationTags and MusicTags
 * - wemeditate: Authors, Albums, Music, Pages
 * - meditations: Meditations, Frames, Music
 * - storyblok: Lessons, Lectures
 *
 * Authentication: Requires admin session
 *
 * Query Parameters (POST):
 * - dryRun: If 'true', validates without writing to database
 * - update: If 'true', updates existing records (default: skip existing)
 * - collection: Target collection for paginated import (required if offset/limit used)
 * - offset: Starting index for pagination (default: 0)
 * - limit: Maximum items to process (default: environment-based)
 */

import type { BaseImporter } from '../../../../../../seeds/lib/BaseImporter'
import type { PaginationOptions, PaginationResult } from '../../../../../../seeds/lib/pagination'
import type { NextRequest } from 'next/server'

import { getPayload } from 'payload'

import config from '@payload-config'

import {
  getScriptMetadata,
  verifyCountsForScript,
  type ScriptName,
} from '../../../../../../seeds/lib/expectedCounts'

const VALID_SCRIPTS: ScriptName[] = ['tags', 'wemeditate', 'meditations', 'storyblok']

/**
 * Heartbeat interval in milliseconds (5 seconds)
 * Prevents Cloudflare Workers 100-second idle timeout
 */
const HEARTBEAT_INTERVAL = 5_000

/**
 * GET /api/seed/:script
 *
 * Returns metadata about the script's collections for pagination planning.
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

  // Get Payload instance
  const payload = await getPayload({ config })

  // Check authentication - require admin session
  const { user } = await payload.auth({ headers: request.headers })

  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check if user is admin
  if (user.collection !== 'managers' || !('type' in user) || user.type !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Return script metadata
  const metadata = getScriptMetadata(script as ScriptName)

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * POST /api/seed/:script
 *
 * Triggers content seeding. Supports paginated execution via query params.
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

  // Get Payload instance
  const payload = await getPayload({ config })

  // Check authentication - require admin session
  const { user } = await payload.auth({ headers: request.headers })

  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check if user is admin (Managers with type='admin')
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

  // Validate pagination params - offset/limit require collection
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

  // Build pagination options if collection is specified
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
      const importer = await getImporter(script as ScriptName, payload, dryRun, updateMode, sendEvent, pagination)

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

      // Send initial heartbeat immediately (provides instant feedback)
      await sendEvent({
        type: 'heartbeat',
        operation: 'Starting...',
        elapsedMs: 0,
      })

      // Start heartbeat interval to prevent Cloudflare 100-second idle timeout
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
          // Stream may be closed, stop heartbeat
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval)
            heartbeatInterval = null
          }
        }
      }

      // Send initial heartbeat immediately, then continue at interval
      await sendHeartbeat()
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

      // Run the importer
      await importer.run()

      // Get final counts from database
      const counts = await getDatabaseCounts(payload, script as ScriptName)

      // Verify counts against expected minimums (adjusted for pagination if applicable)
      const { results: verification, allPassed: verificationPassed } = verifyCountsForScript(
        script as ScriptName,
        counts,
        pagination,
      )

      // Get report data
      const report = importer.getReport()
      const errorMessages = report.getErrors()
      const warningMessages = report.getWarnings()

      // Build pagination result if paginated
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
      // Clean up heartbeat interval
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      await writer.close()
    }
  }

  // Start the importer without awaiting (runs in background)
  runImporter()

  // Return SSE response
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/**
 * Get the appropriate importer class for the script
 */
async function getImporter(
  script: ScriptName,
  payload: Awaited<ReturnType<typeof getPayload>>,
  dryRun: boolean,
  updateMode: boolean,
  onProgress: (data: Record<string, unknown>) => Promise<void>,
  pagination?: PaginationOptions,
) {
  const options = {
    dryRun,
    clearCache: false,
    updateMode,
    payload,
    onProgress,
    pagination,
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
    default:
      return null
  }
}

/**
 * Get database counts for verification
 */
async function getDatabaseCounts(
  payload: Awaited<ReturnType<typeof getPayload>>,
  script: ScriptName,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  try {
    switch (script) {
      case 'tags': {
        const meditationTags = await payload.count({ collection: 'meditation-tags' })
        const musicTags = await payload.count({ collection: 'music-tags' })
        const imageTags = await payload.count({ collection: 'image-tags' })
        counts['meditation-tags'] = meditationTags.totalDocs
        counts['music-tags'] = musicTags.totalDocs
        counts['image-tags'] = imageTags.totalDocs
        break
      }
      case 'wemeditate': {
        const authors = await payload.count({ collection: 'authors' })
        const albums = await payload.count({ collection: 'albums' })
        const music = await payload.count({ collection: 'music' })
        const pages = await payload.count({ collection: 'pages' })
        counts['authors'] = authors.totalDocs
        counts['albums'] = albums.totalDocs
        counts['music'] = music.totalDocs
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
    }
  } catch (error) {
    // Log but don't fail - counts are for verification only
    payload.logger.error({ msg: 'Failed to get database counts', error })
  }

  return counts
}
