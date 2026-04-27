import type { Endpoint } from 'payload'

import { z } from 'zod'

const paramsSchema = z.object({
  narratorId: z.string().min(1),
})

/**
 * GET /api/frames/by-narrator/:narratorId
 *
 * Returns frames filtered by the narrator's gender (imageSet).
 * Sort by mimeType to show images before videos (image/* < video/*).
 */
export const framesByNarrator: Endpoint = {
  path: '/by-narrator/:narratorId',
  method: 'get',
  handler: async (req) => {
    const parsed = paramsSchema.safeParse({
      narratorId: req.routeParams?.narratorId,
    })

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { narratorId } = parsed.data

    // Look up narrator to get gender (findByID throws NotFound on invalid ID)
    let narrator
    try {
      narrator = await req.payload.findByID({
        collection: 'narrators',
        id: narratorId,
        depth: 0,
      })
    } catch {
      return Response.json({ errors: [{ message: 'Narrator not found' }] }, { status: 404 })
    }

    // Get frames filtered by narrator's gender (imageSet)
    // Sort by mimeType to show images before videos (image/* < video/*).
    // depth: 1 hydrates `subtleSystemNode` so the FrameInserter can group by slug.
    const frames = await req.payload.find({
      collection: 'frames',
      where: { imageSet: { equals: narrator.gender } },
      sort: 'mimeType',
      limit: 100,
      depth: 1,
    })

    return Response.json(frames)
  },
}
