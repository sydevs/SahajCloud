import type { Endpoint } from 'payload'

import { z } from 'zod'

import { downloadToBuffer, extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/nirmalaVidyaApi'

const paramsSchema = z.object({
  id: z.string().min(1),
})

/**
 * POST /api/lectures/:id/refresh
 *
 * Re-fetches lecture metadata from the Nirmala Vidya API.
 * Returns the fresh field values as JSON — does NOT auto-save.
 * The admin UI presents the refreshed data for the user to review and save manually.
 *
 * Uses POST because the handler creates a new Images document (thumbnail).
 */
export const refreshLecture: Endpoint = {
  path: '/:id/refresh',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = paramsSchema.safeParse({
      id: req.routeParams?.id,
    })

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { id } = parsed.data

    // Load the existing lecture
    let lecture
    try {
      lecture = await req.payload.findByID({
        collection: 'lectures',
        id,
        depth: 0,
      })
    } catch {
      return Response.json({ error: 'Lecture not found' }, { status: 404 })
    }

    if (!lecture.nirmalVidyaVimeoUrl) {
      return Response.json(
        { error: 'Lecture has no Nirmala Vidya Vimeo URL — cannot refresh.' },
        { status: 422 },
      )
    }

    const vimeoId = extractVimeoId(lecture.nirmalVidyaVimeoUrl)
    if (!vimeoId) {
      return Response.json(
        { error: 'Stored Vimeo URL is invalid — cannot refresh.' },
        { status: 422 },
      )
    }

    let videoData
    try {
      videoData = await fetchNirmalaVidyaVideo(vimeoId)
    } catch (error) {
      return Response.json(
        {
          error: `Nirmala Vidya API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 502 },
      )
    }

    // Attempt to download and create a new thumbnail image
    let thumbnailId: number | undefined
    try {
      const thumbnailBuffer = await downloadToBuffer(
        videoData.thumbnailUrl,
        `lecture-thumbnail-${vimeoId}.jpg`,
      )
      const thumbnailImage = await req.payload.create({
        collection: 'images',
        data: { alt: videoData.title || vimeoId },
        file: thumbnailBuffer,
        req,
      })
      thumbnailId = thumbnailImage.id
    } catch (thumbError) {
      req.payload.logger.warn({
        msg: 'Failed to download refreshed lecture thumbnail',
        vimeoId,
        error: thumbError instanceof Error ? thumbError.message : String(thumbError),
      })
    }

    return Response.json({
      title: videoData.title,
      videoUrl: videoData.hlsUrl,
      thumbnail: thumbnailId ?? null,
      lastRefreshed: new Date().toISOString(),
    })
  },
}
