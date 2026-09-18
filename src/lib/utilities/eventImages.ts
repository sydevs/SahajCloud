import type { Payload, PayloadRequest, SelectType } from 'payload'

import type { Image } from '@/payload-types'

/**
 * Fields an image needs to render as `og:image` or an `<img>`.
 *
 * `filename` is co-selected because `url` is virtual and reads it — a select
 * naming `url` alone yields `null` and the image silently disappears rather
 * than erroring (see the co-select rule in `docs/rules/endpoints.md`).
 */
export const IMAGE_SELECT: SelectType = { url: true, alt: true, filename: true }

/** Photos on a class, at most this many, matching the field's own `maxRows`. */
export const EVENT_IMAGE_LIMIT = 7

/**
 * A class's photos, **in the order the editor arranged them**.
 *
 * `images` is an ordered `hasMany` upload field, and the first entry is the lead
 * photo — it becomes `og:image`, which is the one a social card unfurls. A
 * `where: { id: { in: [...] } }` read returns rows in *database* order, so the
 * ids have to be re-applied afterwards; without this an event whose editor put
 * image 42 first would unfurl image 7 simply because 7 sorts lower. (Payload's
 * own `depth: 1` populate preserves the order, which is why reading the images
 * separately — cheaper for the many classes that have none — has to restore it.)
 *
 * Ids with no surviving row (deleted, or not readable by this caller) drop out
 * rather than leaving a hole.
 *
 * `access` is spelled out at each call site because the two callers need
 * opposite things: the public endpoint reads as its client on the caller's
 * request, while a virtual field's projection reads committed state on its own
 * connection.
 */
export async function readEventImages(
  imageIds: number[],
  access: { payload: Payload; overrideAccess: boolean; req?: PayloadRequest },
): Promise<Image[]> {
  const { docs } = await access.payload.find({
    collection: 'images',
    where: { id: { in: imageIds } },
    limit: EVENT_IMAGE_LIMIT,
    depth: 0,
    select: IMAGE_SELECT,
    overrideAccess: access.overrideAccess,
    ...(access.req ? { req: access.req } : {}),
  })
  const byId = new Map(docs.map((doc) => [doc.id, doc as Image]))
  return imageIds.map((id) => byId.get(id)).filter((doc): doc is Image => doc !== undefined)
}
