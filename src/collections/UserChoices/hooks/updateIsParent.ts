import type { PayloadRequest } from 'payload'

/**
 * Update the `isParent` flag on a tag based on whether it has children.
 *
 * The `req` is threaded through so both the `count` and `update` join the
 * caller's Payload transaction. Without it, two concurrent reparenting events
 * on the same parent could interleave their count→update steps and leave
 * `isParent` flipped against reality.
 */
export async function updateIsParent(
  req: PayloadRequest,
  parentId: number | string,
): Promise<void> {
  const { totalDocs } = await req.payload.count({
    collection: 'user-choices',
    where: { parent: { equals: parentId } },
    req,
  })

  await req.payload.update({
    collection: 'user-choices',
    id: parentId,
    data: { isParent: totalDocs > 0 },
    context: { skipIsParentHook: true },
    req,
  })
}
