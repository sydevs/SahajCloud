import type { PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

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
  // Manual span: the count + self-update is the write-path cost of a reparent.
  // Wrapping it nests the auto-instrumented `pg` queries under a named node so a
  // trace attributes the cost to this hook — parity with the #531 write-path
  // spans (recomputeMeditationNodeWeights, cascadeFrameNodeChange). See #534.
  await Sentry.startSpan(
    {
      name: 'userChoices.updateIsParent',
      op: 'payload.hook.afterChange',
      attributes: { 'parent.id': parentId },
    },
    async (span) => {
      const { totalDocs } = await req.payload.count({
        collection: 'user-choices',
        where: { parent: { equals: parentId } },
        req,
      })

      span.setAttribute('children.count', totalDocs)

      await req.payload.update({
        collection: 'user-choices',
        id: parentId,
        data: { isParent: totalDocs > 0 },
        context: { skipIsParentHook: true },
        req,
      })
    },
  )
}
