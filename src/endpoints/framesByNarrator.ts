import type { Endpoint } from 'payload'

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
    const narratorId = req.routeParams?.narratorId as string

    if (!narratorId) {
      return Response.json({ error: 'Narrator ID required' }, { status: 400 })
    }

    // Look up narrator to get gender
    const narrator = await req.payload.findByID({
      collection: 'narrators',
      id: narratorId,
      depth: 0,
    })

    if (!narrator) {
      return Response.json({ error: 'Narrator not found' }, { status: 404 })
    }

    // Get frames filtered by narrator's gender (imageSet)
    // Sort by mimeType to show images before videos (image/* < video/*)
    const frames = await req.payload.find({
      collection: 'frames',
      where: { imageSet: { equals: narrator.gender } },
      sort: 'mimeType',
      limit: 100,
      depth: 0,
    })

    return Response.json(frames)
  },
}
