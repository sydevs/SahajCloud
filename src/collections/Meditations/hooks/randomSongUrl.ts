import type { FieldHook, Where } from 'payload'

import { getR2Url } from '@/lib/storage/r2NativeAdapter'

/**
 * afterRead hook for the randomSongUrl virtual field.
 * Returns the URL of a random song tagged with the meditation's songTag.
 * Uses efficient count + random offset approach (2 queries).
 */
export const randomSongUrlAfterRead: FieldHook = async ({ data, req }) => {
  const songTagId =
    typeof data?.songTag === 'object' && data?.songTag !== null ? data.songTag.id : data?.songTag
  if (!songTagId) return null

  const songWhere: Where = {
    tags: { in: [songTagId] },
    deletedAt: { exists: false },
    includeForMeditations: { not_equals: false },
  }

  const { totalDocs } = await req.payload.count({
    collection: 'songs',
    where: songWhere,
  })

  if (totalDocs === 0) return null

  const randomPage = Math.floor(Math.random() * totalDocs) + 1

  const { docs } = await req.payload.find({
    collection: 'songs',
    where: songWhere,
    select: { filename: true },
    limit: 1,
    page: randomPage,
    depth: 0,
  })

  const song = docs[0]
  if (!song?.filename) return null

  return getR2Url(song.filename) ?? `/api/songs/file/${song.filename}`
}
