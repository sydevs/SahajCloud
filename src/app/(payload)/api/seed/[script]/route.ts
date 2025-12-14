/**
 * Seed API Route
 *
 * POST /api/seed/:script
 *
 * Triggers content seeding for the specified script.
 * Streams progress updates via Server-Sent Events.
 *
 * Scripts:
 * - tags: MeditationTags and MusicTags
 * - wemeditate: Authors, Albums, Music, Pages
 * - meditations: Meditations, Frames, Music
 * - storyblok: Lessons, Lectures
 *
 * Authentication: Requires admin session
 *
 * Query Parameters:
 * - dryRun: If 'true', validates without writing to database
 */

import type { NextRequest } from 'next/server'

import { getPayload } from 'payload'

import config from '@payload-config'

type ScriptName = 'tags' | 'wemeditate' | 'meditations' | 'storyblok'

const VALID_SCRIPTS: ScriptName[] = ['tags', 'wemeditate', 'meditations', 'storyblok']

/**
 * POST /api/seed/:script
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

  // Check if user is admin (only Managers have admin field)
  if (user.collection !== 'managers' || !('admin' in user) || !user.admin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Parse query parameters
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Helper to send SSE events
  const sendEvent = async (data: Record<string, unknown>) => {
    const message = `data: ${JSON.stringify(data)}\n\n`
    await writer.write(encoder.encode(message))
  }

  // Run the importer in the background
  const runImporter = async () => {
    try {
      await sendEvent({
        type: 'start',
        script,
        dryRun,
        timestamp: new Date().toISOString(),
      })

      // Dynamically import the appropriate importer
      const importer = await getImporter(script as ScriptName, payload, dryRun, sendEvent)

      if (!importer) {
        await sendEvent({
          type: 'error',
          message: `Failed to load importer for script: ${script}`,
        })
        await writer.close()
        return
      }

      // Run the importer
      await importer.run()

      // Get final counts from database
      const counts = await getDatabaseCounts(payload, script as ScriptName)

      // Send completion event
      await sendEvent({
        type: 'complete',
        summary: {
          created: importer.getReport().getSummary().created,
          updated: importer.getReport().getSummary().updated,
          skipped: importer.getReport().getSummary().skipped,
          errors: importer.getReport().getSummary().errors,
          counts,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await sendEvent({
        type: 'error',
        message,
      })
    } finally {
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
  onProgress: (data: Record<string, unknown>) => Promise<void>,
) {
  const options = {
    dryRun,
    clearCache: false,
    payload,
    onProgress,
  }

  switch (script) {
    case 'tags': {
      const { TagsImporter } = await import('../../../../../../imports/tags/import')
      return new TagsImporter(options)
    }
    case 'wemeditate': {
      const { WeMeditateImporter } = await import('../../../../../../imports/wemeditate/import')
      return new WeMeditateImporter(options)
    }
    case 'meditations': {
      const { MeditationsImporter } = await import('../../../../../../imports/meditations/import')
      return new MeditationsImporter(options)
    }
    case 'storyblok': {
      const token = process.env.STORYBLOK_ACCESS_TOKEN
      if (!token) {
        throw new Error('STORYBLOK_ACCESS_TOKEN environment variable is required')
      }
      const { StoryblokImporter } = await import('../../../../../../imports/storyblok/import')
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
        counts['meditation-tags'] = meditationTags.totalDocs
        counts['music-tags'] = musicTags.totalDocs
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
        const meditations = await payload.count({ collection: 'meditations' })
        const frames = await payload.count({ collection: 'frames' })
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
