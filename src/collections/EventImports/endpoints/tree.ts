import type { ProposedTree } from '../propose/tree'
import type { Endpoint } from 'payload'

import { z } from 'zod'

import { parseBody, requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport } from '@/payload-types'

import {
  batchIdOf,
  failure,
  loadTarget,
  readExistingRegions,
  readTakenSlugs,
  refuseUnownedTarget,
  targetSubtreeWhere,
} from '../batchRequest'
import { MAX_TREE_EDITS } from '../constants'
import { applyTreeEdits, type TreeEdit } from '../propose/edit'
import { tallyTree } from '../propose/tree'

/**
 * Bounds a single node name.
 *
 * `Regions.name` carries no `maxLength`, so this is the review's own bound
 * rather than the column's — long enough for the longest place name anyone
 * writes, short enough that a pasted document cannot become a region.
 */
const MAX_NODE_NAME = 200

/**
 * Bounds the node key an edit addresses.
 *
 * A key is the proposal's own (`city:id:<feature>`), so nothing legitimate comes
 * near this. It is bounded because the refusal reflects the key back, and an
 * unbounded string echoed into a message is a question better not left open for
 * whatever renders it.
 */
const MAX_NODE_KEY = 200

const bodySchema = z.strictObject({
  edits: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          kind: z.literal('rename'),
          key: z.string().min(1).max(MAX_NODE_KEY),
          name: z.string().min(1).max(MAX_NODE_NAME),
        }),
        z.strictObject({
          kind: z.literal('map'),
          key: z.string().min(1).max(MAX_NODE_KEY),
          regionId: z.int().positive(),
        }),
      ]),
    )
    .min(1)
    .max(MAX_TREE_EDITS),
})

/**
 * POST /api/event-imports/:id/tree
 *
 * Applies a reviewer's renames and mappings to the stored `proposedRegions` and
 * answers with the tree that results. The commit walks whatever this left
 * behind.
 *
 * ⚠ **The propose endpoint is this column's other writer, and the two must not
 * meet.** `propose` rebuilds the tree from the rows and overwrites it, so a
 * second proposal discards every edit made here — which is the documented
 * behaviour (`endpoints/propose.ts`) and why the review asks for a proposal once
 * and then edits. Nothing serialises the two: a reviewer who proposes again
 * reviews again.
 *
 * ⚠ **The `committing` check is a guard, not a lock.** Nothing serialises this
 * against a commit either: a commit that starts between the read below and the
 * write can build its regions from the pre-edit tree and read the edited one on
 * its next chunk. The consequence is a region placed where the reviewer no
 * longer asked for it on their own batch, never a write outside the target —
 * every id an edit can name is read from the target's subtree.
 *
 * ⚠ **Every edit, or none.** A half-applied batch would be stored and then
 * rendered back as the reviewer's own tree (`propose/edit.ts`), so the refusal
 * names the node instead and the stored tree is untouched.
 *
 * ⚠ **The slugs are reassigned from the database on every call, not carried
 * over.** `Regions.slug` is unique collection-wide and somebody else may have
 * taken the one this tree was holding, so a rename reads the namespace again —
 * which is also what frees the slug a node gives up when it is mapped.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * batch they uploaded, reached only from a region's Import tab. `managers` sits
 * in no project and publishes no paths, so this is absent from the OpenAPI
 * client spec for the same reason `setProject` is. Which batch the caller may
 * touch comes from the collection's own `access` (`access.ts`); the subtree
 * check is re-run explicitly because the write that follows elevates past it.
 */
export const editEventImportTree: Endpoint = {
  path: '/:id/tree',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    const batch = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      select: { status: true, targetRegion: true, proposedRegions: true },
      req,
    })) as EventImport | null
    if (!batch) return failure('No such import batch.', 404)
    if (batch.status === 'committing') {
      return failure('This batch is being committed, so its tree can no longer change.', 409)
    }

    const stored = batch.proposedRegions
    if (!stored) return failure('Propose the batch regions before editing them.', 409)

    const targetId = relationId(batch.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) return failure(loaded.error, 422)

    // ⚠ **The subtree is the whole candidate list, and it is read here rather
    // than trusted from the body.** `refuseUnownedTarget` says the caller may
    // write inside the target; it says nothing about the region a `map` edit
    // names, which arrives as a bare id. A region outside the subtree would file
    // this batch's classes outside the region it was aimed at.
    const [mappable, takenSlugs] = await Promise.all([
      readExistingRegions(req, targetSubtreeWhere(targetId), true),
      readTakenSlugs(req),
    ])

    const applied = applyTreeEdits({
      tree: stored as ProposedTree,
      edits: parsed.data.edits as TreeEdit[],
      mappable,
      targetName: loaded.target.name,
      takenSlugs,
    })
    if (!applied.ok) return failure(applied.error, 422)

    await req.payload.update({
      collection: 'event-imports',
      id,
      // The caller's ownership was settled above, and `proposedRegions` is
      // `readOnly` in the admin — so this write elevates past field access
      // deliberately.
      data: { proposedRegions: applied.tree },
      overrideAccess: true,
      depth: 0,
      // The answer is already in hand, and an unbounded update would re-read and
      // re-serialise every row on the batch to discard it.
      select: { status: true },
      req,
    })

    return Response.json({
      ...(loaded.warning ? { warning: loaded.warning } : {}),
      ...tallyTree(applied.tree),
      pruned: applied.pruned,
      proposedRegions: applied.tree,
    })
  },
}
